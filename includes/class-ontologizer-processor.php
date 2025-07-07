<?php

class OntologizerProcessor {
    
    private $api_keys = array();
    private $cache_duration;
    private $rate_limit_delay;
    private $openai_token_usage = 0;
    private $openai_cost_usd = 0.0;
    private $current_main_topic = '';
    
    // Synonym/alias map for flexible entity matching
    private static $entity_synonyms = [
        'seo' => ['search engine optimization', 'seo'],
        'search engine optimization' => ['seo', 'search engine optimization'],
        'ppc' => ['pay per click', 'ppc'],
        'pay per click' => ['ppc', 'pay per click'],
        'sem' => ['search engine marketing', 'sem'],
        'search engine marketing' => ['sem', 'search engine marketing'],
        'higher education' => ['higher education', 'university', 'college'],
        'digital marketing' => ['digital marketing', 'online marketing'],
        'content marketing' => ['content marketing'],
        'smm' => ['social media marketing', 'smm'],
        'social media marketing' => ['smm', 'social media marketing'],
        // Add more as needed
    ];

    // Normalize a string to its canonical synonym key (lowercase, trimmed)
    private static function normalize_entity($entity) {
        $entity_lc = strtolower(trim($entity));
        foreach (self::$entity_synonyms as $key => $aliases) {
            if (in_array($entity_lc, $aliases)) {
                return $key;
            }
        }
        return $entity_lc;
    }

    // Get all synonym/alias variants for an entity
    private static function get_entity_variants($entity) {
        $entity_lc = strtolower(trim($entity));
        foreach (self::$entity_synonyms as $key => $aliases) {
            if (in_array($entity_lc, $aliases)) {
                return $aliases;
            }
        }
        return [$entity_lc];
    }
    
    public function __construct() {
        $this->api_keys = array(
            'openai' => get_option('ontologizer_openai_key', ''),
            'google_kg' => get_option('ontologizer_google_kg_key', ''),
            'gemini' => get_option('ontologizer_gemini_key', '')
        );
        $this->cache_duration = get_option('ontologizer_cache_duration', 3600);
        $this->rate_limit_delay = 0.5; // 500ms delay between API calls
    }
    
    public function process_url($url, $main_topic_strategy = 'strict', $run_fanout_analysis = false) {
        // Allow this script to run for up to 3 minutes to prevent timeouts on complex pages.
        @set_time_limit(180);

        // Validate URL
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new Exception('Invalid URL format provided');
        }
        
        // Check cache first
        $cache_key = 'ontologizer_' . md5($url);
        $cached_result = get_transient($cache_key);
        if ($cached_result !== false) {
            $cached_result['cached'] = true; // Add flag to indicate cached result
            $cached_result['openai_token_usage'] = $this->openai_token_usage;
            $cached_result['openai_cost_usd'] = round($this->openai_cost_usd, 6);
            $cached_result['page_title'] = $cached_result['entities'][0]['name'];
            return $cached_result;
        }
        
        // Step 1: Fetch and parse the webpage
        $html_content = $this->fetch_webpage($url);
        if (!$html_content) {
            throw new Exception('Failed to fetch webpage content. Please check the URL and try again.');
        }
        
        // Step 2: Extract named entities and main topic
        $start_time = microtime(true);
        $text_parts = $this->extract_text_from_html($html_content);
        $extraction_result = $this->extract_entities($html_content);
        if (is_array($extraction_result) && isset($extraction_result['entities'])) {
            $entities = $extraction_result['entities'];
            $openai_main_topic = $extraction_result['main_topic'] ?? '';
        } else {
            $entities = $extraction_result; // fallback for basic extraction
            $openai_main_topic = '';
        }
        error_log(sprintf('Ontologizer: Entity extraction took %.2f seconds.', microtime(true) - $start_time));
        
        // Step 3: Enrich entities with external data
        $start_time = microtime(true);
        $enriched_entities = $this->enrich_entities($entities);
        error_log(sprintf('Ontologizer: Entity enrichment took %.2f seconds.', microtime(true) - $start_time));
        
        // Step 4: Generate JSON-LD schema
        $json_ld = $this->generate_json_ld($enriched_entities, $url, $html_content);
        
        // Step 5: Analyze content and provide recommendations
        $start_time = microtime(true);
        $recommendations = $this->analyze_content($html_content, $enriched_entities, $json_ld);
        error_log(sprintf('Ontologizer: Recommendation generation took %.2f seconds.', microtime(true) - $start_time));
        
        // Step 6: Calculate Topical Salience Score
        $topical_salience = $this->calculate_topical_salience_score($enriched_entities);
        
        // PRIORITIZE OpenAI main topic - only use PHP fallback if OpenAI fails
        $main_topic = $openai_main_topic;
        
        // Only use complex PHP logic as fallback if OpenAI didn't provide a main topic
        if (empty($main_topic)) {
            error_log('Ontologizer: OpenAI main topic empty, using PHP fallback logic');
            
            // Use first entity as basic fallback
            $main_topic = $entities[0] ?? null;
            
            $search_fields = [strtolower($text_parts['title']), strtolower($text_parts['meta'])];
            foreach ($text_parts['headings'] as $h) { $search_fields[] = strtolower($h); }
            
            // Always prefer the longest capitalized phrase in the title that ends with Course/Program/Certificate/Workshop/Seminar
            $title_phrase = null;
            if (preg_match_all('/([A-Z][a-zA-Z]*(?: [A-Z][a-zA-Z]*)* (Course|Program|Certificate|Workshop|Seminar))/i', $text_parts['title'], $matches)) {
                if (!empty($matches[0])) {
                    usort($matches[0], function($a, $b) { return strlen($b) - strlen($a); });
                    $title_phrase = trim($matches[0][0]);
                }
            }
            if ($title_phrase) {
                $main_topic = $title_phrase;
            } else if ($main_topic_strategy === 'title') {
                // Use the longest entity/phrase that appears in the title
                $title_lc = strtolower($text_parts['title']);
                $candidates = array_filter($entities, function($e) use ($title_lc) {
                    return strpos($title_lc, strtolower($e)) !== false;
                });
                if (!empty($candidates)) {
                    usort($candidates, function($a, $b) { return strlen($b) - strlen($a); });
                    $main_topic = $candidates[0];
                }
            } else if ($main_topic_strategy === 'frequent') {
                // Use the most frequent entity/phrase in the body
                $body_lc = strtolower($text_parts['body']);
                $freqs = [];
                foreach ($entities as $e) {
                    $freqs[$e] = substr_count($body_lc, strtolower($e));
                }
                arsort($freqs);
                $main_topic = key($freqs);
            } else if ($main_topic_strategy === 'pattern') {
                // Use the page title if it matches a pattern (e.g., multi-word noun phrase)
                if (preg_match('/([A-Z][a-z]+( [A-Z][a-z]+)+)/', $text_parts['title'], $matches)) {
                    $main_topic = $matches[1];
                }
            }
        } else {
            error_log('Ontologizer: Using OpenAI main topic: "' . $main_topic . '"');
        }
        
        // Store final main topic in class property for context-aware enrichment
        $this->current_main_topic = $main_topic;
        // Add sub-entities from multi-word entities if present in title/meta/headings
        $entity_set = array_map('strtolower', $entities);
        foreach ($entities as $entity) {
            $words = explode(' ', $entity);
            if (count($words) > 1) {
                for ($i = 0; $i < count($words); $i++) {
                    for ($j = $i+1; $j <= count($words); $j++) {
                        $sub = trim(implode(' ', array_slice($words, $i, $j-$i)));
                        if (strlen($sub) > 2 && !in_array(strtolower($sub), $entity_set)) {
                            foreach ($search_fields as $field) {
                                if (strpos($field, strtolower($sub)) !== false) {
                                    $entities[] = $sub;
                                    $entity_set[] = strtolower($sub);
                                }
                            }
                        }
                    }
                }
            }
        }
        // Add n-gram (2-3 word) capitalized phrases from title/meta/headings/URL as entities if not present
        $sources = [$text_parts['title'], $text_parts['meta']];
        foreach ($text_parts['headings'] as $h) { $sources[] = $h; }
        // Add URL path as a source
        if (!empty($url)) {
            $parsed_url = parse_url($url);
            if (!empty($parsed_url['path'])) {
                $sources[] = str_replace(['-', '_', '/'], ' ', $parsed_url['path']);
            }
        }
        $entity_set = array_map('strtolower', $entities);
        $forced_ngrams = [];
        foreach ($sources as $src) {
            preg_match_all('/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/', $src, $matches);
            foreach ($matches[1] as $ngram) {
                $ngram_lc = strtolower($ngram);
                if (!in_array($ngram_lc, $entity_set)) {
                    $entities[] = $ngram;
                    $entity_set[] = $ngram_lc;
                    $forced_ngrams[] = $ngram;
                }
            }
        }
        if (!empty($forced_ngrams)) {
            error_log('Ontologizer: Force-added n-grams: ' . implode(', ', $forced_ngrams));
        }
        $irrelevant_entities = [];
        foreach ($enriched_entities as $entity) {
            $entity_lc = strtolower($entity['name']);
            $in_title = strpos(strtolower($text_parts['title']), $entity_lc) !== false;
            $in_headings = false;
            foreach ($text_parts['headings'] as $h) { if (strpos(strtolower($h), $entity_lc) !== false) $in_headings = true; }
            $in_body = substr_count(strtolower($text_parts['body']), $entity_lc) > 1;
            if (!$in_title && !$in_headings && !$in_body) {
                $irrelevant_entities[] = $entity['name'];
            }
        }
        $salience_tips = $this->get_salience_improvement_tips($main_topic, $irrelevant_entities);
        // Step 7: Run Gemini fan-out analysis if requested
        $fanout_analysis = null;
        if ($run_fanout_analysis && !empty($this->api_keys['gemini'])) {
            $start_time = microtime(true);
            $fanout_analysis = $this->generate_fanout_analysis($html_content, $url);
            error_log(sprintf('Ontologizer: Fan-out analysis took %.2f seconds.', microtime(true) - $start_time));
        }

        $result = array(
            'url' => $url,
            'entities' => $enriched_entities,
            'json_ld' => $json_ld,
            'recommendations' => $recommendations,
            'topical_salience' => $topical_salience,
            'primary_topic' => $main_topic,
            'main_topic_confidence' => !empty($enriched_entities) ? $enriched_entities[0]['confidence_score'] : 0,
            'salience_tips' => $salience_tips,
            'irrelevant_entities' => $irrelevant_entities,
            'processing_time' => microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'],
            'entities_count' => count($enriched_entities),
            'enriched_count' => count(array_filter($enriched_entities, function($e) {
                return !empty($e['wikipedia_url']) || !empty($e['wikidata_url']) || 
                       !empty($e['google_kg_url']) || !empty($e['productontology_url']);
            })),
            'cached' => false,
            'timestamp' => time(),
            'page_title' => $text_parts['title'],
            'openai_token_usage' => $this->openai_token_usage,
            'openai_cost_usd' => round($this->openai_cost_usd, 6),
            'fanout_analysis' => $fanout_analysis,
        );
        
        // Cache the result
        set_transient($cache_key, $result, $this->cache_duration);
        
        return $result;
    }
    
    private function fetch_webpage($url) {
        $args = array(
            'timeout'     => 45, // Increased timeout
            'user-agent'  => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36', // More recent User-Agent
            'sslverify'   => true, // Default to true for security
            'redirection' => 10,   // Allow more redirects
            'headers'     => array(
                'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language' => 'en-US,en;q=0.9',
                'Accept-Encoding' => 'gzip, deflate, br',
            )
        );
        
        $response = wp_remote_get($url, $args);

        // If the request fails, it might be due to SSL verification. Try again without it.
        if (is_wp_error($response)) {
            error_log('Ontologizer: Request failed for ' . $url . '. Error: ' . $response->get_error_message() . '. Retrying without SSL verification.');
            $args['sslverify'] = false;
            $response = wp_remote_get($url, $args);
        }
        
        if (is_wp_error($response)) {
            error_log('Ontologizer: Failed to fetch URL ' . $url . ' - ' . $response->get_error_message());
            return false;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            error_log('Ontologizer: HTTP ' . $status_code . ' for URL ' . $url);
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        
        // Check if content is too large
        if (strlen($body) > 5000000) { // 5MB limit
            $body = substr($body, 0, 5000000);
        }
        
        return $body;
    }
    
    private function extract_entities($html_content) {
        // Clean HTML and extract text content
        $text_parts = $this->extract_text_from_html($html_content);
        $title = strtolower($text_parts['title']);
        $meta = strtolower($text_parts['meta']);
        $headings = array_map('strtolower', $text_parts['headings']);
        $body = strtolower($text_parts['body']);
        // Use OpenAI API for entity extraction if available
        if (!empty($this->api_keys['openai'])) {
            $openai_result = $this->extract_entities_openai($text_parts['title'] . '. ' . $text_parts['meta'] . '. ' . implode('. ', $text_parts['headings']) . '. ' . $text_parts['body']);
            if (is_array($openai_result) && isset($openai_result['entities'])) {
                // Enhance OpenAI results with topic-specific entities that might be missed
                $enhanced_entities = $this->add_topic_specific_entities($openai_result['entities'], $text_parts, $openai_result['main_topic']);
                $openai_result['entities'] = $enhanced_entities;
                return $openai_result; // Return enhanced result with main_topic and entities
            }
        }
        // Fallback to improved basic entity extraction
        $entities = $this->extract_entities_basic($text_parts['title'] . '. ' . $text_parts['meta'] . '. ' . implode('. ', $text_parts['headings']) . '. ' . $text_parts['body']);
        // Score entities
        $scored = [];
        $domain_keywords = ['application security','cloud security','information security','infrastructure security','network security','end-user education','disaster recovery','business continuity','identity and access management','data security'];
        $threat_keywords = ['phishing','ransomware','malware','social engineering','advanced persistent threat','denial of service','ddos','sql injection','botnet'];
        $solution_keywords = ['zero trust','bot protection','fraud protection','ddos protection','app security','api security'];
        foreach ($entities as $entity) {
            $entity_lc = strtolower($entity);
            $score = 0;
            if (strpos($title, $entity_lc) !== false) $score += 30;
            if (strpos($meta, $entity_lc) !== false) $score += 15;
            foreach ($headings as $h) { if (strpos($h, $entity_lc) !== false) $score += 10; }
            $score += substr_count($body, $entity_lc) * 2;
            // Grouping
            $group = 'other';
            foreach ($domain_keywords as $k) if (strpos($entity_lc, $k) !== false) $group = 'domain';
            foreach ($threat_keywords as $k) if (strpos($entity_lc, $k) !== false) $group = 'threat';
            foreach ($solution_keywords as $k) if (strpos($entity_lc, $k) !== false) $group = 'solution';
            $scored[] = [ 'name' => $entity, 'score' => $score, 'group' => $group ];
        }
        // Sort by score desc
        usort($scored, function($a, $b) { return $b['score'] - $a['score']; });
        // Return just the names, sorted
        return array_column($scored, 'name');
    }
    
    private function extract_headings($dom) {
        $headings = [];
        foreach (['h1', 'h2', 'h3'] as $tag) {
            $nodes = $dom->getElementsByTagName($tag);
            foreach ($nodes as $node) {
                $headings[] = trim($node->nodeValue);
            }
        }
        return $headings;
    }

    private function extract_text_from_html($html) {
        if (empty($html)) {
            return [
                'title' => '',
                'meta' => '',
                'headings' => [],
                'body' => ''
            ];
        }
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html);
        $xpath = new DOMXPath($dom);
        // Extract <title>
        $title = '';
        $titleNodes = $dom->getElementsByTagName('title');
        if ($titleNodes->length > 0) {
            $title = trim($titleNodes->item(0)->nodeValue);
        }
        // Extract meta description
        $metaDesc = '';
        foreach ($dom->getElementsByTagName('meta') as $meta) {
            if (strtolower($meta->getAttribute('name')) === 'description') {
                $metaDesc = trim($meta->getAttribute('content'));
                break;
            }
        }
        // Extract headings
        $headings = $this->extract_headings($dom);
        // Remove elements that are typically not part of the main content
        $selectors_to_remove = [
            "//script", "//style", "//noscript", "//header", "//footer", "//nav", "//aside", "//form",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' sidebar ')]",
            "//*[contains(concat(' ', normalize-space(@id), ' '), ' sidebar ')]",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' comment ')]",
            "//*[contains(concat(' ', normalize-space(@id), ' '), ' comment ')]",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' nav ')]",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' footer ')]",
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' header ')]",
            "//*[contains(@id, 'cookie') or contains(@class, 'cookie') or contains(@id, 'consent') or contains(@class, 'consent')]",
            "//div[@aria-label='cookieconsent']",
            // Additional selectors for better content filtering
            "//*[contains(@class, 'widget')]",
            "//*[contains(@class, 'ad')]", 
            "//*[contains(@class, 'advertisement')]",
            "//*[contains(@class, 'banner')]",
            "//*[contains(@class, 'promo')]",
            "//*[contains(@class, 'social')]",
            "//*[contains(@class, 'share')]",
            "//*[contains(@class, 'related')]",
            "//*[contains(@class, 'popular')]",
            "//*[contains(@class, 'trending')]",
            "//*[contains(@class, 'sponsored')]",
            "//*[contains(@id, 'sidebar')]",
            "//*[contains(@id, 'widget')]",
            "//*[contains(@id, 'ad')]"
        ];

        foreach ($xpath->query(implode('|', $selectors_to_remove)) as $node) {
            if ($node && $node->parentNode) {
                $node->parentNode->removeChild($node);
            }
        }
        
        // Attempt to find the main content element by finding the element with the most text
        $main_content_selectors = [
            '//article',
            '//main',
            "//*[@role='main']",
            "//*[contains(@class, 'post-content')]",
            "//*[contains(@class, 'entry-content')]",
            "//*[contains(@id, 'main')]",
            "//*[contains(@class, 'main')]",
            "//*[contains(@id, 'content')]",
            "//*[contains(@class, 'content')]",
        ];
        
        $best_node = null;
        $max_length = 0;

        foreach ($main_content_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes) {
                foreach ($nodes as $node) {
                    $current_length = strlen(trim($node->nodeValue));
                    if ($current_length > $max_length) {
                        $max_length = $current_length;
                        $best_node = $node;
                    }
                }
            }
        }

        $text_content = '';
        if ($best_node) {
            $text_content = $best_node->nodeValue;
        } else {
            // Fallback to the whole body if a specific content area isn't found
            $body = $dom->getElementsByTagName('body')->item(0);
            if ($body) {
                $text_content = $body->nodeValue;
            }
        }

        // Clean up text
        $text = html_entity_decode($text_content, ENT_QUOTES, 'UTF-8');
        $text = strip_tags($text);
        $text = preg_replace('/\s+/', ' ', $text);
        
        return [
            'title' => $title,
            'meta' => $metaDesc,
            'headings' => $headings,
            'body' => trim($text)
        ];
    }
    
    private function extract_entities_openai($text) {
        // Use more content for better context (up to 8000 chars instead of 3000)
        $content_for_analysis = substr($text, 0, 8000);
        
                 $prompt = "Analyze this web page content to extract entities and identify the main topic using Wikipedia-style semantic precision.

MAIN TOPIC RULES:
- Extract the PRIMARY business service, product, or subject (2-6 words max)
- For location-specific services: include the key location in the main topic (e.g., 'O'Hare Limo Service', 'Denver Airport Transportation')
- For general limo/transportation: use 'Limo Service' or 'Airport Transportation'
- For SEO articles: use 'SEO' or 'AI Search Optimization' 
- For cybersecurity: use 'Cybersecurity' or specific service type
- If content is about a SPECIFIC location's service, include that location in the main topic
- Avoid generic marketing phrases like 'Greater Chicago' unless that's the actual business focus

WIKIPEDIA-STYLE ENTITY EXTRACTION:
- Extract 15-20 HIGH-QUALITY entities that would definitely have Wikipedia pages or be notable enough for Wikipedia
- Think: \"Would this entity have its own Wikipedia article or be a redirect to a notable page?\"
- PREFER entities that are:
  * Proper nouns (companies, places, people, brands, technologies)
  * Well-known concepts with clear definitions (Search Engine Optimization, not \"optimization\")
  * Specific institutions, products, or services (Palo Alto University, not \"universities\")
  * Industry-standard terms (Schema Markup, Technical SEO, Content Marketing)

SEMANTIC ACCURACY RULES:
- For \"Student Recruitment\" → think \"Student recruitment\" (general concept), NOT academic papers about recruitment
- For \"Higher Education\" → think \"Higher education\" (field of study), NOT \"Higher education accreditation\"
- For \"AI SEO\" → think \"Search engine optimization\" or \"Artificial intelligence\", NOT \"AI Seoul Summit\"
- For \"Analytics\" → think \"Analytics\" (general field), NOT \"Google Analytics\" (specific tool)
- AVOID overly specific research papers, academic studies, or location-specific variants
- AVOID adding extra qualifiers unless they're part of the actual entity name

FILTERING RULES:
- Include: companies, brands, people, specific locations, products, technologies, key concepts
- EXCLUDE abstract concepts like: wonder, invention, discernment, tenacity, enablement, galvanizing
- EXCLUDE generic business terms: pricing, location, reliability, efficiency, comfort  
- EXCLUDE template elements: Semrush, social media widgets, cookie notices
- Each entity: 1-4 words maximum
- Focus on entities that support the main topic and would be recognized by Wikipedia

EXAMPLES:
- O'Hare limo page: Echo Limousine, O'Hare Airport, Airport Transportation, Chauffeur, Limousine
- SEO page: Search Engine Optimization, Google Search, Schema Markup, Technical SEO, Content Marketing
- Education page: Higher Education, Student Recruitment, Academic Programs, Distance Learning

Return JSON format:
{
  \"main_topic\": \"(primary service/subject with location if relevant, 2-6 words)\",
  \"entities\": [\"Entity 1\", \"Entity 2\", \"Entity 3\", ...]
}

Content:
" . $content_for_analysis;
        
        // Prepare the request data
        $request_data = array(
            'model' => 'gpt-4o',
            'messages' => array(
                array('role' => 'user', 'content' => $prompt)
            ),
            'max_tokens' => 1000,
            'temperature' => 0.3, // Lower temperature for more consistent results
            'response_format' => ['type' => 'json_object']
        );
        
        $json_body = json_encode($request_data);
        if ($json_body === false) {
            error_log('Ontologizer: Failed to encode JSON for OpenAI request');
            return array();
        }
        
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->api_keys['openai'],
                'Content-Type' => 'application/json'
            ),
            'body' => $json_body,
            'timeout' => 45
        ));
        
        if (is_wp_error($response)) {
            error_log('Ontologizer: OpenAI API error - ' . $response->get_error_message());
            return array();
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['choices'][0]['message']['content'])) {
            $content = json_decode($data['choices'][0]['message']['content'], true);
            
            if (isset($content['entities']) && is_array($content['entities'])) {
                // Track token usage and cost
                if (isset($data['usage'])) {
                    $tokens = $data['usage']['total_tokens'] ?? 0;
                    $prompt_tokens = $data['usage']['prompt_tokens'] ?? 0;
                    $completion_tokens = $data['usage']['completion_tokens'] ?? 0;
                    $this->openai_token_usage += $tokens;
                    // GPT-4o pricing (June 2024): $0.000005/input, $0.000015/output
                    $cost = ($prompt_tokens * 0.000005) + ($completion_tokens * 0.000015);
                    $this->openai_cost_usd += $cost;
                }
                
                // Log what OpenAI extracted for debugging
                error_log('Ontologizer: OpenAI extracted main topic: "' . ($content['main_topic'] ?? 'none') . '"');
                error_log('Ontologizer: OpenAI extracted ' . count($content['entities']) . ' entities: ' . implode(', ', array_slice($content['entities'], 0, 10)));
                
                // Return both main topic and entities
                return [
                    'main_topic' => $content['main_topic'] ?? '',
                    'entities' => $content['entities']
                ];
            }
        }
        
        // Fallback if the response is not as expected
        return [
            'main_topic' => '',
            'entities' => $this->extract_entities_basic($text)
        ];
    }
    
    private function extract_entities_basic($text) {
        $entities = array();
        
        // Extract capitalized words that might be entities
        preg_match_all('/\b[A-Z][a-zA-Z\s&]+(?:\s+[A-Z][a-zA-Z\s&]+)*\b/', $text, $matches);
        
        foreach ($matches[0] as $match) {
            $match = trim($match);
            if (strlen($match) > 2 && strlen($match) < 50) {
                $entities[] = $match;
            }
        }
        
        // Extract potential product names and brands
        preg_match_all('/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pro|Max|Plus|Ultra|Elite|Premium|Standard|Basic|Lite|Mini|Air|Pro|Studio|Enterprise|Professional)\b/i', $text, $product_matches);
        foreach ($product_matches[0] as $match) {
            $entities[] = trim($match);
        }
        
        // Remove duplicates and common words
        $entities = array_unique($entities);
        $common_words = array('The', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'Of', 'With', 'By', 'From', 'This', 'That', 'These', 'Those', 'All', 'Some', 'Any', 'Each', 'Every', 'No', 'Not', 'Only', 'Just', 'Very', 'More', 'Most', 'Less', 'Least', 'Much', 'Many', 'Few', 'Several', 'Various', 'Different', 'Same', 'Similar', 'Other', 'Another', 'Next', 'Last', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth');
        $entities = array_diff($entities, $common_words);
        
        // Filter out entities that are too generic
        $entities = array_filter($entities, function($entity) {
            $generic_patterns = array('/^\d+$/', '/^[A-Z]$/', '/^[A-Z]\s*[A-Z]$/');
            foreach ($generic_patterns as $pattern) {
                if (preg_match($pattern, $entity)) {
                    return false;
                }
            }
            return true;
        });
        
        return array_slice($entities, 0, 40);
    }
    
    private function add_topic_specific_entities($openai_entities, $text_parts, $main_topic) {
        $enhanced_entities = $openai_entities;
        $all_text = strtolower($text_parts['title'] . ' ' . $text_parts['meta'] . ' ' . implode(' ', $text_parts['headings']) . ' ' . $text_parts['body']);
        $main_topic_lower = strtolower($main_topic);
        
        // Define topic-specific entity patterns to look for
        $topic_patterns = [];
        
        // Limo/Transportation service patterns
        if (strpos($main_topic_lower, 'limo') !== false || strpos($main_topic_lower, 'transportation') !== false) {
            $topic_patterns = [
                'Airport Transportation', 'Car Service', 'Chauffeur Service', 'Limousine Service',
                'Private Transportation', 'Executive Transportation', 'Luxury Transportation',
                'Airport Transfer', 'Ground Transportation', 'Corporate Transportation',
                'Wedding Transportation', 'Chauffeur', 'Limousine', 'Executive Car',
                'Town Car', 'SUV Service', 'Party Bus', 'Charter Service'
            ];
        }
        
        // SEO/Search optimization patterns
        if (strpos($main_topic_lower, 'seo') !== false || strpos($main_topic_lower, 'search') !== false) {
            $topic_patterns = [
                'Search Engine Optimization', 'SEO', 'Search Rankings', 'Keyword Research',
                'On-Page SEO', 'Technical SEO', 'Link Building', 'Content Optimization',
                'Schema Markup', 'Meta Tags', 'Title Tags', 'Search Visibility',
                'Organic Traffic', 'SERP', 'Google Algorithm', 'Ranking Factors',
                'Search Console', 'Analytics', 'Page Speed', 'Mobile Optimization'
            ];
        }
        
        // Higher Education patterns
        if (strpos($main_topic_lower, 'higher ed') !== false || strpos($main_topic_lower, 'education') !== false) {
            $topic_patterns = [
                'Higher Education', 'University Marketing', 'Student Recruitment',
                'Academic Programs', 'Distance Learning', 'Online Education',
                'Student Enrollment', 'Graduate Programs', 'Undergraduate Programs',
                'Educational Technology', 'Learning Management System', 'Campus Life'
            ];
        }
        
        // Add entities that appear in content but might have been missed by OpenAI
        foreach ($topic_patterns as $pattern) {
            $pattern_lower = strtolower($pattern);
            if (strpos($all_text, $pattern_lower) !== false) {
                // Check if this entity or a very similar one is already in the list
                $already_exists = false;
                foreach ($enhanced_entities as $existing) {
                    if (strtolower($existing) === $pattern_lower || 
                        strpos(strtolower($existing), $pattern_lower) !== false ||
                        strpos($pattern_lower, strtolower($existing)) !== false) {
                        $already_exists = true;
                        break;
                    }
                }
                
                if (!$already_exists) {
                    $enhanced_entities[] = $pattern;
                    error_log("Ontologizer: Added topic-specific entity: '$pattern'");
                }
            }
        }
        
        return $enhanced_entities;
    }
    
    private function enrich_entities($entities) {
        $enriched = array();
        $total_entities = count($entities);
        
        // Use configured max entities setting but with smart caching
        $max_entities = min(20, get_option('ontologizer_max_entities', 20)); // Back to 20 with caching
        $entities = array_slice($entities, 0, $max_entities);
        $total_entities = count($entities);
        
        // Circuit breaker: stop after successful enrichments to prevent timeouts
        $successful_enrichments = 0;
        $cache_hits = 0;
        $max_successful = 12;
        $max_with_cache = 18; // Allow more entities if many are cached

        // Define non-entity patterns to filter out
        $non_entity_patterns = [
            '/pricing/i', '/location/i', '/reliability/i', '/efficiency/i', '/comfort/i',
            '/framework/i', '/reports?/i', '/surveys?/i', '/meet.?greet/i', '/pick.?up/i', '/drop.?off/i',
            '/car.?seat/i', '/booster/i', '/flight.?status/i', '/white.?papers/i', '/ai.?search.?success/i',
            '/intelligence.?reports/i', '/working.?genius/i', '/semrush/i', '/widget/i', '/sidebar/i',
            '/advertisement/i', '/banner/i', '/social.?media/i', '/cookie/i', '/consent/i', '/share/i',
            // Abstract concepts that are rarely useful entities
            '/^wonder$/i', '/^invention$/i', '/^discernment$/i', '/^tenacity$/i', '/^enablement$/i', 
            '/^galvanizing$/i', '/^empowerment$/i', '/^synergy$/i', '/^leverage$/i', '/^optimization$/i',
            '/^transformation$/i', '/^innovation$/i', '/^excellence$/i', '/^leadership$/i'
        ];

        foreach ($entities as $index => $entity) {
            // Filter out entities longer than 5 words
            if (str_word_count($entity) > 5) {
                error_log("Ontologizer: Filtered long entity: '$entity'");
                continue;
            }
            
            // Early filter for entities that are unlikely to have Wikipedia pages
            $entity_lower = strtolower($entity);
            $unlikely_wikipedia_patterns = [
                '/^(seo tracking|seo strategy|local seo|national seo|technical seo|ai seo)$/i', // SEO variants that don't have pages
                '/^(search rankings|ranking keywords|ranking factors)$/i', // Generic ranking terms
                '/^(student recruitment|prospective students|enrollment goals)$/i', // Generic education terms  
                '/^(organic traffic|crawl errors|schema markup)$/i', // Generic technical terms
                '/^(program pages|geo-targeted keywords)$/i', // Generic web terms
            ];
            
            $is_unlikely_wikipedia = false;
            foreach ($unlikely_wikipedia_patterns as $pattern) {
                if (preg_match($pattern, $entity_lower)) {
                    error_log("Ontologizer: Skipped entity unlikely to have Wikipedia page: '$entity'");
                    $is_unlikely_wikipedia = true;
                    break;
                }
            }
            if ($is_unlikely_wikipedia) {
                continue;
            }
            
            // Filter out non-entity patterns
            $is_non_entity = false;
            foreach ($non_entity_patterns as $pattern) {
                if (preg_match($pattern, $entity_lower)) {
                    $is_non_entity = true;
                    break;
                }
            }
            if ($is_non_entity) {
                error_log("Ontologizer: Filtered non-entity: '$entity'");
                continue;
            }
            
            // Filter out common template/sidebar entities that shouldn't be enriched
            $template_entities = ['semrush', 'google analytics', 'facebook', 'twitter', 'linkedin', 'instagram', 
                                'youtube', 'pinterest', 'tiktok', 'snapchat', 'subscribe', 'newsletter', 'rss'];
            if (in_array($entity_lower, $template_entities)) {
                error_log("Ontologizer: Filtered template entity: '$entity'");
                continue;
            }
            
            // Filter out overly generic single-word entities that provide little value
            $generic_entities = ['domestic', 'international', 'private', 'public', 'service', 'services', 
                               'location', 'locations', 'type', 'types', 'area', 'areas'];
            if (in_array($entity_lower, $generic_entities) && str_word_count($entity) === 1) {
                error_log("Ontologizer: Filtered generic entity: '$entity'");
                continue;
            }
            // Check cache first for high-quality entities
            $cached_entity = $this->get_cached_entity($entity);
            if ($cached_entity) {
                // Use cached data
                $enriched_entity = $cached_entity;
                $cache_hits++;
                // Recalculate relevance score for current position in results
                $relevance_score = (($total_entities - $index) / $total_entities) * 70;
                $enriched_entity['confidence_score'] = $this->calculate_confidence_score($enriched_entity, $relevance_score);
            } else {
                // Calculate a base score based on relevance (position in the array)
                // The most relevant entity (index 0) gets the highest base score.
                $relevance_score = (($total_entities - $index) / $total_entities) * 70;

                $enriched_entity = array(
                    'name' => $entity,
                    'wikipedia_url' => null,
                    'wikidata_url' => null,
                    'google_kg_url' => null,
                    'productontology_url' => null,
                    'confidence_score' => round($relevance_score),
                    'type' => null // Add type field
                );
                
                // Enrich with Wikipedia (pass main topic for context)
                $enriched_entity['wikipedia_url'] = $this->find_wikipedia_url($entity, $this->current_main_topic);
                
                // Enrich with Wikidata
                if ($enriched_entity['wikipedia_url']) {
                    $enriched_entity['wikidata_url'] = $this->find_wikidata_url_from_wikipedia($enriched_entity['wikipedia_url']);
                }
                // Fallback to direct Wikidata search if not found via Wikipedia
                if (!$enriched_entity['wikidata_url']) {
                    $enriched_entity['wikidata_url'] = $this->find_wikidata_url_direct($entity);
                }
                
                // Enrich with Google Knowledge Graph
                $enriched_entity['google_kg_url'] = $this->find_google_kg_url($entity);
                
                // Enrich with ProductOntology
                $enriched_entity['productontology_url'] = $this->find_productontology_url($entity);
                
                // Try to determine type (Person, Organization, etc.)
                $enriched_entity['type'] = $this->detect_entity_type($enriched_entity);
                
                // Update confidence score based on found sources
                $enriched_entity['confidence_score'] = $this->calculate_confidence_score($enriched_entity, $relevance_score);
                
                // Cache high-quality entities for future use
                $this->cache_entity($entity, $enriched_entity);
            }
            
            $enriched[] = $enriched_entity;
            $successful_enrichments++;
            
            // Dynamic circuit breaker: allow more entities if many are cached (fast)
            $dynamic_max = ($cache_hits >= 5) ? $max_with_cache : $max_successful;
            
            // Circuit breaker: stop processing if we've enriched enough entities
            if ($successful_enrichments >= $dynamic_max) {
                error_log("Ontologizer: Circuit breaker activated - stopping after $successful_enrichments successful enrichments ($cache_hits cache hits)");
                break;
            }
            
            // Rate limiting
            usleep($this->rate_limit_delay * 1000000);
        }
        
        // Sort by final confidence score
        usort($enriched, function($a, $b) {
            return $b['confidence_score'] - $a['confidence_score'];
        });
        
        return $enriched;
    }
    
    private function find_wikipedia_url($entity, $context_main_topic = '') {
        // Special handling for common abbreviations that often get mismatched
        $entity_lower = strtolower($entity);
        $context_lower = strtolower($context_main_topic);
        
        if ($entity_lower === 'seo') {
            // For SEO, try multiple search approaches to find the right Wikipedia page
            $search_terms = [
                'Search Engine Optimization',
                'SEO Search Engine Optimization', 
                'Search engine optimization'
            ];
            
            foreach ($search_terms as $search_term) {
                $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode($search_term) . '&limit=5&namespace=0&format=json';
                $result = $this->try_wikipedia_search($search_url, $entity);
                if ($result) {
                    return $result;
                }
            }
            
            // Fallback to direct search
            $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode($entity) . '&limit=10&namespace=0&format=json';
        } elseif ($entity_lower === 'academic programs' && strpos($context_lower, 'education') !== false) {
            // For Academic Programs in education context, search for educational concept
            $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode('Academic program education') . '&limit=5&namespace=0&format=json';
        } elseif ($entity_lower === "o'hare airport" || $entity_lower === 'ohare airport' || $entity_lower === "o'hare" || $entity_lower === 'ohare') {
            // For O'Hare, search for the main airport page
            $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode("O'Hare International Airport") . '&limit=5&namespace=0&format=json';
        } elseif (preg_match('/(.+)\s+airport$/i', $entity, $matches)) {
            // For any airport, try searching for "[Name] International Airport" or "[Name] Airport"
            $airport_name = trim($matches[1]);
            $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode($airport_name . ' International Airport') . '&limit=5&namespace=0&format=json';
        } else {
            $search_url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' . urlencode($entity) . '&limit=5&namespace=0&format=json';
        }
        
        $response = wp_remote_get($search_url, array('timeout' => 8)); // Reduced timeout
        if (is_wp_error($response)) {
            error_log('Ontologizer: Wikipedia API error - ' . $response->get_error_message());
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!isset($data[1]) || !isset($data[3]) || empty($data[1])) {
            return null;
        }
        
        // Get search results and URLs
        $titles = $data[1];
        $urls = $data[3];
        
        // Try to find the best match
        $best_match = $this->find_best_wikipedia_match($entity, $titles, $urls);
        
        if ($best_match) {
            error_log('Ontologizer: Found Wikipedia match for "' . $entity . '" -> "' . $best_match['title'] . '" (confidence: ' . $best_match['confidence'] . ')');
            return $best_match['url'];
        }
        
        error_log('Ontologizer: No suitable Wikipedia match found for "' . $entity . '"');
        return null;
    }
    
    private function try_wikipedia_search($search_url, $entity) {
        $response = wp_remote_get($search_url, array('timeout' => 8));
        if (is_wp_error($response)) {
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!isset($data[1]) || !isset($data[3]) || empty($data[1])) {
            return null;
        }
        
        // Get search results and URLs
        $titles = $data[1];
        $urls = $data[3];
        
        // Try to find the best match
        $best_match = $this->find_best_wikipedia_match($entity, $titles, $urls);
        
        if ($best_match && $best_match['confidence'] >= 65) {
            error_log('Ontologizer: Found Wikipedia match for "' . $entity . '" -> "' . $best_match['title'] . '" (confidence: ' . $best_match['confidence'] . ')');
            return $best_match['url'];
        }
        
        return null;
    }
    
    private function find_best_wikipedia_match($entity, $titles, $urls) {
        $entity_lower = strtolower(trim($entity));
        $best_match = null;
        $best_score = 0;
        
        for ($i = 0; $i < count($titles) && $i < count($urls); $i++) {
            $title = $titles[$i];
            $url = $urls[$i];
            $title_lower = strtolower($title);
            
            // Strict semantic filtering for common mismatches
            $semantic_mismatches = [
                // SEO-related mismatches
                'seo' => ['seoul', 'ai seoul summit'],
                'ai seo' => ['seoul', 'ai seoul summit'],
                
                // Education mismatches
                'colleges & universities' => ['wood county', 'texas', 'in wood county'],
                'higher education' => ['accreditation', 'higher education accreditation'],
                'academic programs' => ['international', 'academic programs international'],
                
                // Generic term mismatches
                'analytics' => ['google analytics', 'web analytics'],
                'content marketing' => ['strategy', 'content marketing strategy'],
            ];
            
            // Check for semantic mismatches
            $is_semantic_mismatch = false;
            foreach ($semantic_mismatches as $entity_pattern => $forbidden_patterns) {
                if (strpos($entity_lower, $entity_pattern) !== false) {
                    foreach ($forbidden_patterns as $forbidden) {
                        if (strpos($title_lower, $forbidden) !== false) {
                            $is_semantic_mismatch = true;
                            error_log("Ontologizer: Semantic mismatch detected: '$entity' should not match '$title'");
                            break 2;
                        }
                    }
                }
            }
            
            if ($is_semantic_mismatch) {
                continue;
            }
            
            // Context-aware filtering for common mismatches
            if ($entity_lower === 'seo' && strpos($title_lower, 'seoul') !== false) {
                continue;
            }
            
            // Filter out obviously irrelevant matches that add noise
            $irrelevant_patterns = [
                '/food.?depository/i', '/ufo.?sighting/i', '/transit.?system/i',
                '/gen.?z.?slang/i', '/mba.?programme.?rankings/i', '/soccer.?league/i',
                '/marine.?consortium/i', '/^search.?ranking$/i',
                '/wood.?county/i', '/in.?texas/i', '/texas$/i',
                '/\\(.+\\)$/', // Skip anything with parenthetical descriptions unless exact match
            ];
            
            $is_irrelevant = false;
            foreach ($irrelevant_patterns as $pattern) {
                if (preg_match($pattern, $title_lower)) {
                    // Only skip if it's not an exact match
                    if ($entity_lower !== $title_lower) {
                        $is_irrelevant = true;
                        break;
                    }
                }
            }
            
            if ($is_irrelevant) {
                error_log("Ontologizer: Skipping irrelevant Wikipedia match: '$title' for entity '$entity'");
                continue;
            }
            
            // Calculate match score
            $score = $this->calculate_wikipedia_match_score($entity_lower, $title_lower, $title);
            
            // Stricter thresholds - require higher confidence
            $min_score = (strpos($title, '(') !== false) ? 85 : 65; // Raised from 70/40
            
            // Additional validation for high-scoring matches
            if ($score > 70) { // Raised threshold from 60
                // Verify the page content matches the entity
                $content_match = $this->verify_wikipedia_page_content($url, $entity_lower);
                if ($content_match) {
                    $score += 10; // Reduced bonus from 15
                } else {
                    $score -= 30; // Increased penalty from 20
                }
            }
            
            // Check for disambiguation pages
            if (strpos($title_lower, '(disambiguation)') !== false || strpos($title_lower, 'disambiguation') !== false) {
                $score -= 50; // Heavy penalty for disambiguation pages
            }
            
            // Check for redirects or stub pages
            if (strpos($title_lower, 'redirect') !== false || strpos($title_lower, 'stub') !== false) {
                $score -= 30;
            }
            
            if ($score > $best_score && $score >= $min_score) {
                $best_score = $score;
                $best_match = array(
                    'title' => $title,
                    'url' => $url,
                    'confidence' => $score
                );
            }
        }
        
        // Stricter confidence threshold
        return ($best_score >= 65) ? $best_match : null; // Raised from 45
    }
    
    private function calculate_wikipedia_match_score($entity_lower, $title_lower, $title) {
        $score = 0;
        
        // Exact match gets highest score
        if ($entity_lower === $title_lower) {
            $score = 100;
        }
        // Special handling for airport entities
        elseif (strpos($entity_lower, 'airport') !== false && strpos($title_lower, 'airport') !== false) {
            // Extract airport name without "airport" or "international"
            $entity_name = trim(str_replace(['airport', 'international'], '', $entity_lower));
            $title_name = trim(str_replace(['airport', 'international'], '', $title_lower));
            
            if ($entity_name === $title_name) {
                $score = 95; // Very high score for airport name matches
            } elseif (strpos($title_name, $entity_name) !== false || strpos($entity_name, $title_name) !== false) {
                $score = 85; // High score for partial airport name matches
            }
        }
        // Full entity contained in title (e.g., "AI SEO" in "AI SEO Strategy")
        elseif (strpos($title_lower, $entity_lower) !== false) {
            // But penalize if title has too many extra words
            $title_words = explode(' ', $title_lower);
            $entity_words = explode(' ', $entity_lower);
            $extra_words = count($title_words) - count($entity_words);
            
            if ($extra_words <= 2) {
                $score = 85; // Good match with few extra words
            } else {
                $score = 60; // Lower score for titles with many extra words
            }
        }
        // Entity contains title (less common, should be stricter)
        elseif (strpos($entity_lower, $title_lower) !== false) {
            $score = 75;
        }
        // Word-based matching - much stricter
        else {
            $entity_words = array_filter(explode(' ', $entity_lower));
            $title_words = array_filter(explode(' ', $title_lower));
            
            // Remove common stop words that shouldn't count as matches
            $stop_words = ['the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
            $entity_words = array_diff($entity_words, $stop_words);
            $title_words = array_diff($title_words, $stop_words);
            
            if (empty($entity_words) || empty($title_words)) {
                $score = 0;
            } else {
                $common_words = array_intersect($entity_words, $title_words);
                $entity_word_ratio = count($common_words) / count($entity_words);
                $title_word_ratio = count($common_words) / count($title_words);
                
                // Require high overlap for both entity and title
                $min_ratio = min($entity_word_ratio, $title_word_ratio);
                $avg_ratio = ($entity_word_ratio + $title_word_ratio) / 2;
                
                // Much stricter: require at least 70% word overlap
                if ($min_ratio >= 0.7 && $avg_ratio >= 0.8) {
                    $score = $avg_ratio * 50; // Max 50 for word-based matching
                } else {
                    $score = 0; // No match if insufficient overlap
                }
            }
        }
        
        // Bonus for proper capitalization (reduced)
        if (preg_match('/^[A-Z][a-z]/', $title)) {
            $score += 5; // Reduced from 10
        }
        
        // Stricter penalty for very long titles
        if (strlen($title) > strlen($entity_lower) * 2.5) { // More lenient threshold
            $score -= 30; // Increased penalty from 20
        }
        
        // Additional penalty for geographic specificity mismatches
        $entity_has_geo = preg_match('/\b(county|texas|california|florida|new york|state|city)\b/i', $entity_lower);
        $title_has_geo = preg_match('/\b(county|texas|california|florida|new york|state|city)\b/i', $title_lower);
        
        if (!$entity_has_geo && $title_has_geo) {
            $score -= 40; // Heavy penalty for unwanted geographic specificity
        }
        
        return max(0, $score);
    }
    
    private function verify_wikipedia_page_content($url, $entity_lower) {
        // Extract page title from URL
        $page_title = basename($url);
        $page_title = urldecode($page_title);
        
        // Get page content via API to verify it's about the right entity
        $api_url = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=' . urlencode($page_title) . '&format=json&exlimit=1';
        
        $response = wp_remote_get($api_url, array('timeout' => 6)); // Reduced timeout
        if (is_wp_error($response)) {
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (!isset($data['query']['pages'])) {
            return false;
        }
        
        foreach ($data['query']['pages'] as $page) {
            if (isset($page['extract'])) {
                $extract = strip_tags($page['extract']);
                $extract_lower = strtolower($extract);
                
                // Check if the entity name appears in the first paragraph
                if (strpos($extract_lower, $entity_lower) !== false) {
                    return true;
                }
                
                // Check for entity words in the extract
                $entity_words = array_filter(explode(' ', $entity_lower));
                $found_words = 0;
                foreach ($entity_words as $word) {
                    if (strlen($word) > 2 && strpos($extract_lower, $word) !== false) {
                        $found_words++;
                    }
                }
                
                $word_ratio = $found_words / count($entity_words);
                return $word_ratio >= 0.5; // At least 50% of words should match
            }
        }
        
        return false;
    }
    
    private function find_wikidata_url_from_wikipedia($wikipedia_url) {
        if (!$wikipedia_url) {
            return null;
        }
        
        // Extract page title from Wikipedia URL
        $page_title = basename($wikipedia_url);
        $page_title = urldecode($page_title);
        
        $api_url = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=' . urlencode($page_title) . '&format=json';
        
        $response = wp_remote_get($api_url, array('timeout' => 6)); // Reduced timeout
        if (is_wp_error($response)) {
            error_log('Ontologizer: Wikipedia API error for Wikidata lookup - ' . $response->get_error_message());
            return null;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['query']['pages'])) {
            foreach ($data['query']['pages'] as $page) {
                if (isset($page['pageprops']['wikibase_item'])) {
                    $wikidata_id = $page['pageprops']['wikibase_item'];
                    
                    // For airport entities, be more lenient with verification
                    if (strpos(strtolower($page_title), 'airport') !== false) {
                        error_log('Ontologizer: Found Wikidata ID for airport "' . $page_title . '" -> ' . $wikidata_id);
                        return 'https://www.wikidata.org/wiki/' . $wikidata_id;
                    }
                    
                    // Verify the Wikidata entity is valid for non-airport entities
                    if ($this->verify_wikidata_entity($wikidata_id, $page_title)) {
                        return 'https://www.wikidata.org/wiki/' . $wikidata_id;
                    } else {
                        error_log('Ontologizer: Wikidata verification failed for "' . $page_title . '" -> ' . $wikidata_id);
                    }
                }
            }
        }
        
        return null;
    }

    private function find_wikidata_url_direct($entity) {
        $entity_lower = strtolower($entity);
        $context_lower = strtolower($this->current_main_topic);
        
        // Context-aware search terms for better Wikidata matching
        $search_terms = [$entity];
        
        if ($entity_lower === 'academic programs' && strpos($context_lower, 'education') !== false) {
            // For Academic Programs in education context, prioritize educational concept
            $search_terms = [
                'academic program',
                'degree program',
                'academic programme',
                'university program',
                $entity
            ];
        }
        
        foreach ($search_terms as $search_term) {
            $api_url = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' . urlencode($search_term) . '&language=en&limit=5&format=json';

            $response = wp_remote_get($api_url, array('timeout' => 8)); // Reduced timeout
            if (is_wp_error($response)) {
                error_log('Ontologizer: Wikidata API error - ' . $response->get_error_message());
                continue; // Try next search term
            }

            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            if (!isset($data['search']) || empty($data['search'])) {
                continue; // Try next search term
            }
            
            // Find the best match from search results
            $entity_lower = strtolower(trim($entity));
            $best_match = null;
            $best_score = 0;
            
            foreach ($data['search'] as $result) {
                $label = $result['label'] ?? '';
                $description = $result['description'] ?? '';
                $label_lower = strtolower($label);
                
                // Apply same semantic filtering as Wikipedia
                if ($this->is_wikidata_semantic_mismatch($entity_lower, $label_lower, $description)) {
                    continue;
                }
                
                // Calculate match score
                $score = $this->calculate_wikidata_match_score($entity_lower, $label_lower, $description);
                
                if ($score > $best_score) {
                    $best_score = $score;
                    $best_match = $result;
                }
            }
            
            // Stricter confidence threshold - raised from 60 to 75
            if ($best_score >= 75 && $best_match) {
                error_log('Ontologizer: Found Wikidata match for "' . $entity . '" -> "' . $best_match['label'] . '" (confidence: ' . $best_score . ')');
                return 'https://www.wikidata.org/wiki/' . $best_match['id'];
            }
        }
        
        return null;
    }
    
    private function is_wikidata_semantic_mismatch($entity_lower, $label_lower, $description) {
        // Filter out overly specific academic papers, research studies, and location-specific content
        $academic_patterns = [
            '/\bin\s+(new\s+zealand|australia|canada|united\s+states|uk|scotland|wales)\b/i',
            '/comparison\s+of\s+traditional\s+versus/i',
            '/attitudes\s+towards\s+a\s+graduate-entry/i',
            '/ranking\s+factors\s+involved\s+in\s+diabetes/i',
            '/machine-learning\s+integrating\s+clinical/i',
            '/demographics\s+and\s+outcomes\s+in\s+mechanical/i',
            '/including\s+migration\s+between\s+the\s+disciplines/i',
            '/performance\s+monitoring\s+(by\s+the\s+medial\s+frontal\s+cortex|for\s+action)/i',
            '/traffic\s+control\s+collaborative/i',
        ];
        
        $full_text = $label_lower . ' ' . strtolower($description);
        foreach ($academic_patterns as $pattern) {
            if (preg_match($pattern, $full_text)) {
                error_log("Ontologizer: Wikidata semantic mismatch: '$entity_lower' rejected due to academic/specific content in '$label_lower'");
                return true;
            }
        }
        
        // Filter out overly long research paper titles
        if (strlen($label_lower) > 100 && str_word_count($label_lower) > 10) {
            error_log("Ontologizer: Wikidata semantic mismatch: '$entity_lower' rejected due to overly long label '$label_lower'");
            return true;
        }
        
        return false;
    }
    
    private function calculate_wikidata_match_score($entity_lower, $label_lower, $description) {
        $score = 0;
        
        // Exact label match gets highest score
        if ($entity_lower === $label_lower) {
            $score = 100;
        }
        // Partial matches
        elseif (strpos($label_lower, $entity_lower) !== false) {
            $score = 80;
        }
        elseif (strpos($entity_lower, $label_lower) !== false) {
            $score = 70;
        }
        // Word-based matching
        else {
            $entity_words = array_filter(explode(' ', $entity_lower));
            $label_words = array_filter(explode(' ', $label_lower));
            
            $common_words = array_intersect($entity_words, $label_words);
            $word_match_ratio = count($common_words) / max(count($entity_words), count($label_words));
            
            $score = $word_match_ratio * 60;
        }
        
        // Bonus for description relevance
        if (!empty($description)) {
            $desc_lower = strtolower($description);
            $entity_words = array_filter(explode(' ', $entity_lower));
            $found_words = 0;
            foreach ($entity_words as $word) {
                if (strlen($word) > 2 && strpos($desc_lower, $word) !== false) {
                    $found_words++;
                }
            }
            $desc_ratio = $found_words / count($entity_words);
            $score += $desc_ratio * 20;
        }
        
        return max(0, $score);
    }
    
    private function verify_wikidata_entity($wikidata_id, $expected_title) {
        // Verify the Wikidata entity exists and has the expected label
        $api_url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' . $wikidata_id . '&languages=en&format=json';
        
        $response = wp_remote_get($api_url, array('timeout' => 6)); // Reduced timeout
        if (is_wp_error($response)) {
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (isset($data['entities'][$wikidata_id]['labels']['en']['value'])) {
            $wikidata_label = $data['entities'][$wikidata_id]['labels']['en']['value'];
            $expected_lower = strtolower($expected_title);
            $wikidata_lower = strtolower($wikidata_label);
            
            // Check if labels match reasonably well
            return $this->calculate_wikidata_match_score($expected_lower, $wikidata_lower, '') >= 50;
        }
        
        return false;
    }
    
    private function find_google_kg_url($entity) {
        if (!empty($this->api_keys['google_kg'])) {
            // Use the Google Knowledge Graph API
            $api_url = 'https://kgsearch.googleapis.com/v1/entities:search?query=' . urlencode($entity) . '&key=' . $this->api_keys['google_kg'] . '&limit=5&types=Thing';
            
            $response = wp_remote_get($api_url, array('timeout' => 6)); // Reduced timeout
            if (is_wp_error($response)) {
                error_log('Ontologizer: Google KG API error - ' . $response->get_error_message());
                return $this->get_google_search_fallback_url($entity);
            }

            $body = wp_remote_retrieve_body($response);
            $data = json_decode($body, true);

            if (isset($data['itemListElement']) && !empty($data['itemListElement'])) {
                // Find the best match from results
                $entity_lower = strtolower(trim($entity));
                $best_match = null;
                $best_score = 0;
                
                foreach ($data['itemListElement'] as $item) {
                    if (isset($item['result'])) {
                        $result = $item['result'];
                        $name = $result['name'] ?? '';
                        $description = $result['description'] ?? '';
                        $name_lower = strtolower($name);
                        
                        // Calculate match score
                        $score = $this->calculate_google_kg_match_score($entity_lower, $name_lower, $description);
                        
                        if ($score > $best_score) {
                            $best_score = $score;
                            $best_match = $result;
                        }
                    }
                }
                
                // Only return matches with reasonable confidence
                if ($best_score >= 60 && $best_match && isset($best_match['@id'])) {
                    $kgid = $best_match['@id'];
                    $mid = str_replace('kg:', '', $kgid);
                    error_log('Ontologizer: Found Google KG match for "' . $entity . '" -> "' . $best_match['name'] . '" (confidence: ' . $best_score . ')');
                    return 'https://www.google.com/search?kgmid=' . $mid;
                }
            }
        }
        
        // Fallback to a standard Google search if no API key or no result
        return $this->get_google_search_fallback_url($entity);
    }
    
    private function calculate_google_kg_match_score($entity_lower, $name_lower, $description) {
        $score = 0;
        
        // Exact name match gets highest score
        if ($entity_lower === $name_lower) {
            $score = 100;
        }
        // Partial matches
        elseif (strpos($name_lower, $entity_lower) !== false) {
            $score = 80;
        }
        elseif (strpos($entity_lower, $name_lower) !== false) {
            $score = 70;
        }
        // Word-based matching
        else {
            $entity_words = array_filter(explode(' ', $entity_lower));
            $name_words = array_filter(explode(' ', $name_lower));
            
            $common_words = array_intersect($entity_words, $name_words);
            $word_match_ratio = count($common_words) / max(count($entity_words), count($name_words));
            
            $score = $word_match_ratio * 60;
        }
        
        // Bonus for description relevance
        if (!empty($description)) {
            $desc_lower = strtolower($description);
            $entity_words = array_filter(explode(' ', $entity_lower));
            $found_words = 0;
            foreach ($entity_words as $word) {
                if (strlen($word) > 2 && strpos($desc_lower, $word) !== false) {
                    $found_words++;
                }
            }
            $desc_ratio = $found_words / count($entity_words);
            $score += $desc_ratio * 20;
        }
        
        return max(0, $score);
    }
    
    private function get_google_search_fallback_url($entity) {
        return 'https://www.google.com/search?q=' . urlencode($entity);
    }
    
    private function find_productontology_url($entity) {
        $slugs_to_try = [
            str_replace(' ', '_', ucwords(strtolower($entity))), // Ucwords_With_Underscores
            str_replace(' ', '-', strtolower($entity)),          // lowercase-with-hyphens
            str_replace(' ', '_', strtolower($entity)),          // lowercase_with_underscores
            ucfirst(strtolower($entity)),                        // Capitalized
            strtoupper($entity)                                  // UPPERCASE
        ];

        $paths_to_try = ['/id/', '/doc/'];

        foreach ($paths_to_try as $path) {
            foreach (array_unique($slugs_to_try) as $slug) {
                $url = 'http://www.productontology.org' . $path . $slug;
                $response = wp_remote_head($url, array('timeout' => 5));
                if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                    return $url;
                }
            }
        }
        
        return null;
    }
    
    private function calculate_confidence_score($entity, $base_score) {
        $source_bonus = 0;
        $validation_bonus = 0;
        
        // Base source bonuses
        if ($entity['wikipedia_url']) {
            $source_bonus += 15; // Increased from 10 due to better validation
        }
        if ($entity['wikidata_url']) {
            $source_bonus += 10; // Increased from 5 due to better validation
        }
        if ($entity['google_kg_url'] && strpos($entity['google_kg_url'], 'kgmid=') !== false) {
            $source_bonus += 15; // Increased from 10 due to better validation
        }
        if ($entity['productontology_url']) {
            $source_bonus += 5;
        }
        
        // Validation bonuses based on match quality
        // These would be set by the validation methods if we track them
        // For now, we'll add bonuses based on URL presence (indicating good matches)
        
        // Multiple source validation bonus
        $source_count = 0;
        if ($entity['wikipedia_url']) $source_count++;
        if ($entity['wikidata_url']) $source_count++;
        if ($entity['google_kg_url'] && strpos($entity['google_kg_url'], 'kgmid=') !== false) $source_count++;
        if ($entity['productontology_url']) $source_count++;
        
        if ($source_count >= 3) {
            $validation_bonus += 20; // High confidence when multiple sources agree
        } elseif ($source_count >= 2) {
            $validation_bonus += 10; // Medium confidence when 2 sources agree
        }
        
        // Entity type bonus (more specific types get higher scores)
        if (isset($entity['type'])) {
            switch (strtolower($entity['type'])) {
                case 'person':
                case 'organization':
                    $validation_bonus += 10;
                    break;
                case 'place':
                case 'location':
                    $validation_bonus += 8;
                    break;
                case 'product':
                case 'service':
                    $validation_bonus += 6;
                    break;
                default:
                    $validation_bonus += 3;
                    break;
            }
        }

        $final_score = $base_score + $source_bonus + $validation_bonus;
        
        return min(100, round($final_score)); // Cap score at 100
    }
    
    private function generate_json_ld($enriched_entities, $page_url, $html_content = null) {
        // Determine the most appropriate schema type based on content analysis
        $schema_type = $this->detect_primary_schema_type($enriched_entities, $page_url, $html_content);
        
        // Generate schema based on detected type
        switch ($schema_type) {
            case 'Service':
                return $this->generate_service_schema($enriched_entities, $page_url, $html_content);
            case 'LocalBusiness':
                return $this->generate_local_business_schema($enriched_entities, $page_url, $html_content);
            case 'EducationalOccupationalProgram':
                return $this->generate_educational_program_schema($enriched_entities, $page_url, $html_content);
            case 'Article':
                return $this->generate_article_schema($enriched_entities, $page_url, $html_content);
            default:
                return $this->generate_webpage_schema($enriched_entities, $page_url, $html_content);
        }
    }
    
    private function detect_primary_schema_type($enriched_entities, $page_url, $html_content) {
        if (!$html_content) {
            return 'WebPage';
        }
        
        $text_parts = $this->extract_text_from_html($html_content);
        $combined_text = strtolower($text_parts['title'] . ' ' . $text_parts['meta'] . ' ' . implode(' ', $text_parts['headings']));
        
        // Service schema patterns
        $service_patterns = [
            '/\b(service|services|assisted living|limo|limousine|transportation|chauffeur|car service)\b/i',
            '/\b(provider|offering|support|care|assistance)\b/i'
        ];
        
        // LocalBusiness patterns
        $business_patterns = [
            '/\b(phone|telephone|\(\d{3}\)|address|location|contact|hours|business)\b/i',
            '/\b(restaurant|hotel|store|shop|clinic|office|center|facility)\b/i'
        ];
        
        // Educational patterns
        $education_patterns = [
            '/\b(program|course|degree|diploma|certificate|education|training|academy|university|college)\b/i',
            '/\b(student|enrollment|curriculum|credits|accreditation)\b/i'
        ];
        
        // Article/Blog patterns
        $article_patterns = [
            '/\b(how to|guide|tutorial|tips|advice|blog|article)\b/i',
            '/\b(author|posted|published|written by)\b/i'
        ];
        
        // Count pattern matches
        $service_score = 0;
        $business_score = 0;
        $education_score = 0;
        $article_score = 0;
        
        foreach ($service_patterns as $pattern) {
            $service_score += preg_match_all($pattern, $combined_text);
        }
        
        foreach ($business_patterns as $pattern) {
            $business_score += preg_match_all($pattern, $combined_text);
        }
        
        foreach ($education_patterns as $pattern) {
            $education_score += preg_match_all($pattern, $combined_text);
        }
        
        foreach ($article_patterns as $pattern) {
            $article_score += preg_match_all($pattern, $combined_text);
        }
        
        // Determine highest scoring type
        $scores = [
            'Service' => $service_score,
            'LocalBusiness' => $business_score,
            'EducationalOccupationalProgram' => $education_score,
            'Article' => $article_score
        ];
        
        $max_score = max($scores);
        if ($max_score < 2) {
            return 'WebPage'; // Default fallback
        }
        
        return array_search($max_score, $scores);
    }
    
    private function generate_service_schema($enriched_entities, $page_url, $html_content) {
        $text_parts = $this->extract_text_from_html($html_content);
        $additional_schemas = $this->extract_additional_schemas($html_content);
        
        // Extract service name from title or main entity
        $service_name = $this->extract_service_name($text_parts, $enriched_entities);
        $service_type = $this->extract_service_type($text_parts, $enriched_entities);
        
        $schema = array(
            '@context' => 'https://schema.org/',
            '@type' => 'Service',
            'serviceType' => $service_type,
            'name' => $service_name,
            'url' => $page_url
        );
        
        // Add description if available
        if (!empty($text_parts['meta'])) {
            $schema['description'] = $text_parts['meta'];
        }
        
        // Add sameAs array for the service
        $service_same_as = $this->build_service_same_as($service_name, $service_type);
        if (!empty($service_same_as)) {
            $schema['sameAs'] = $service_same_as;
            $schema['additionalType'] = 'http://www.productontology.org/id/' . str_replace(' ', '_', $service_type);
        }
        
        // Add provider organization
        $provider = $this->extract_service_provider($text_parts, $enriched_entities, $html_content);
        if (!empty($provider)) {
            $schema['provider'] = $provider;
        }
        
        // Add FAQ and HowTo if detected
        if (!empty($additional_schemas['faq'])) {
            $schema['mainEntity'] = $additional_schemas['faq'];
        } elseif (!empty($additional_schemas['howto'])) {
            $schema['mainEntity'] = $additional_schemas['howto'];
        }
        
        return $this->validate_and_enhance_schema($schema, $enriched_entities);
    }
    
    private function generate_local_business_schema($enriched_entities, $page_url, $html_content) {
        $text_parts = $this->extract_text_from_html($html_content);
        $additional_schemas = $this->extract_additional_schemas($html_content);
        
        $business_name = $this->extract_business_name($text_parts, $enriched_entities);
        
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'LocalBusiness',
            'name' => $business_name,
            'url' => $page_url
        );
        
        // Add description
        if (!empty($text_parts['meta'])) {
            $schema['description'] = $text_parts['meta'];
        }
        
        // Extract contact information
        $contact_info = $this->extract_contact_information($html_content);
        if (!empty($contact_info)) {
            $schema = array_merge($schema, $contact_info);
        }
        
        // Add service offerings
        $services = $this->extract_business_services($text_parts, $enriched_entities);
        if (!empty($services)) {
            $schema['hasOfferCatalog'] = array(
                '@type' => 'OfferCatalog',
                'name' => 'Comprehensive Services',
                'itemListElement' => $services
            );
        }
        
        // Add knowsAbout for business expertise
        $knows_about = $this->build_knows_about_array($enriched_entities, $this->current_main_topic);
        if (!empty($knows_about)) {
            $schema['knowsAbout'] = $knows_about;
        }
        
        // Add sameAs array
        $same_as = $this->build_comprehensive_same_as($business_name, $html_content);
        if (!empty($same_as)) {
            $schema['sameAs'] = $same_as;
        }
        
        return $this->validate_and_enhance_schema($schema, $enriched_entities);
    }
    
    private function generate_educational_program_schema($enriched_entities, $page_url, $html_content) {
        $text_parts = $this->extract_text_from_html($html_content);
        $additional_schemas = $this->extract_additional_schemas($html_content);
        
        $program_name = $this->extract_program_name($text_parts, $enriched_entities);
        
        // Create WebPage as root schema
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'WebPage',
            'name' => $text_parts['title'] ?: $program_name,
            'url' => $page_url
        );
        
        // Add page description
        if (!empty($text_parts['meta'])) {
            $schema['description'] = $text_parts['meta'];
        }
        
        // Add video if detected
        $video = $this->extract_video_object($html_content);
        if (!empty($video)) {
            $schema['video'] = $video;
        }
        
        // Add significant links
        $significant_links = $this->extract_significant_links($html_content);
        if (!empty($significant_links)) {
            $schema['significantLink'] = $significant_links;
        }
        
        // Extract multiple programs if available
        $programs = $this->extract_multiple_programs($html_content, $program_name, $page_url, $text_parts);
        
        // Add provider institution to each program
        $provider = $this->extract_educational_provider($text_parts, $enriched_entities, $html_content);
        
        if (!empty($programs)) {
            foreach ($programs as &$program) {
                if (!empty($provider)) {
                    $program['provider'] = $provider;
                }
            }
            
            // Set programs as mainEntity (array if multiple, single if one)
            $schema['mainEntity'] = count($programs) > 1 ? $programs : $programs[0];
        } else {
            // Fallback to single program
            $educational_program = array(
                '@type' => 'EducationalOccupationalProgram',
                'name' => $program_name,
                'url' => $page_url
            );
            
            // Add program description
            if (!empty($text_parts['meta'])) {
                $educational_program['description'] = $text_parts['meta'];
            }
            
            // Extract program details
            $program_details = $this->extract_program_details($html_content);
            if (!empty($program_details)) {
                $educational_program = array_merge($educational_program, $program_details);
            }
            
            if (!empty($provider)) {
                $educational_program['provider'] = $provider;
            }
            
            $schema['mainEntity'] = $educational_program;
        }
        
        // Add FAQ as hasPart of WebPage (not the program)
        if (!empty($additional_schemas['faq'])) {
            $schema['hasPart'] = $additional_schemas['faq'];
        }
        
        // Add provider at WebPage level too for enhanced structured data
        if (!empty($provider)) {
            $schema['provider'] = $provider;
        }
        
        // Add topic entities
        $about_entities = $this->build_about_entities($enriched_entities);
        if (!empty($about_entities)) {
            $schema['about'] = array_slice($about_entities, 0, 4); // Primary topics
            if (count($about_entities) > 4) {
                $schema['mentions'] = array_slice($about_entities, 4, 4); // Secondary topics
            }
        }
        
        // Add publisher if organization detected
        if (!empty($additional_schemas['organization'])) {
            $schema['publisher'] = $additional_schemas['organization'];
        }
        
        // Add speakable specification for voice search
        $schema['speakable'] = array(
            '@type' => 'SpeakableSpecification',
            'xpath' => array(
                '/html/head/title',
                '/html/head/meta[@name="description"]',
                '/html/body//h1',
                '/html/body//h2',
                '/html/body//h3'
            )
        );
        
        return $schema;
    }
    
    private function generate_article_schema($enriched_entities, $page_url, $html_content) {
        $text_parts = $this->extract_text_from_html($html_content);
        $additional_schemas = $this->extract_additional_schemas($html_content);
        
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'WebPage',
            'url' => $page_url,
            'name' => $text_parts['title']
        );
        
        if (!empty($text_parts['meta'])) {
            $schema['description'] = $text_parts['meta'];
        }
        
        // Create Article mainEntity
        $article = array(
            '@type' => 'Article',
            'headline' => $text_parts['title']
        );
        
        if (!empty($text_parts['meta'])) {
            $article['description'] = $text_parts['meta'];
        }
        
        // Add author if detected
        if (!empty($additional_schemas['author'])) {
            $article['author'] = $additional_schemas['author'];
        }
        
        $schema['mainEntity'] = $article;
        
        // Add FAQ and HowTo as hasPart
        $has_part = array();
        if (!empty($additional_schemas['faq'])) {
            $has_part[] = $additional_schemas['faq'];
        }
        if (!empty($additional_schemas['howto'])) {
            $has_part[] = $additional_schemas['howto'];
        }
        
        if (!empty($has_part)) {
            $schema['hasPart'] = $has_part;
        }
        
        // Add topic entities
        $about_entities = $this->build_about_entities($enriched_entities);
        if (!empty($about_entities)) {
            $schema['about'] = $about_entities[0]; // Primary topic
            if (count($about_entities) > 1) {
                $schema['mentions'] = array_slice($about_entities, 1); // Secondary topics
            }
        }
        
        // Add publisher if organization detected
        if (!empty($additional_schemas['organization'])) {
            $schema['publisher'] = $additional_schemas['organization'];
        }
        
        return $this->validate_and_enhance_schema($schema, $enriched_entities);
    }
    
    private function generate_webpage_schema($enriched_entities, $page_url, $html_content) {
        // Original WebPage schema as fallback
        $schema = array(
            '@context' => 'https://schema.org',
            '@type' => 'WebPage',
            'url' => $page_url
        );
        
        if ($html_content) {
            $text_parts = $this->extract_text_from_html($html_content);
            if (!empty($text_parts['title'])) {
                $schema['name'] = $text_parts['title'];
            }
            if (!empty($text_parts['meta'])) {
                $schema['description'] = $text_parts['meta'];
            }
            
            $additional_schemas = $this->extract_additional_schemas($html_content);
            
            // Add author information
            if (!empty($additional_schemas['author'])) {
                $schema['author'] = $additional_schemas['author'];
            }
            
            // Add organization information
            if (!empty($additional_schemas['organization'])) {
                $schema['publisher'] = $additional_schemas['organization'];
            }
            
            // Add FAQ schema if detected
            if (!empty($additional_schemas['faq'])) {
                $schema['mainEntity'] = $additional_schemas['faq'];
            }
            
            // Add HowTo schema if detected
            if (!empty($additional_schemas['howto'])) {
                $schema['mainEntity'] = $additional_schemas['howto'];
            }
        }
        
        // Add entities
        $about_entities = $this->build_about_entities($enriched_entities);
        if (!empty($about_entities)) {
            $schema['about'] = $about_entities;
            $schema['mentions'] = $about_entities;
        }
        
        return $this->validate_and_enhance_schema($schema, $enriched_entities);
    }
    
    private function validate_and_enhance_schema($schema, $enriched_entities) {
        // Validate required properties exist
        if (!isset($schema['@context'])) {
            $schema['@context'] = 'https://schema.org';
        }
        
        if (!isset($schema['@type'])) {
            $schema['@type'] = 'Thing';
        }
        
        // Add speakable specification for voice search
        if (isset($schema['@type']) && in_array($schema['@type'], ['WebPage', 'Article'])) {
            $schema['speakable'] = array(
                '@type' => 'SpeakableSpecification',
                'xpath' => array(
                    '/html/head/title',
                    '/html/head/meta[@name="description"]',
                    '/html/body//h1',
                    '/html/body//h2',
                    '/html/body//h3',
                    '/html/body//p'
                )
            );
        }
        
        return $schema;
    }
    
    private function extract_service_name($text_parts, $enriched_entities) {
        // Try to extract service name from title or first high-confidence entity
        if (!empty($text_parts['title'])) {
            // Look for service patterns in title
            if (preg_match('/^(.+?)\s*[-|]\s*(.+)$/', $text_parts['title'], $matches)) {
                return trim($matches[1]);
            }
            return $text_parts['title'];
        }
        
        return !empty($enriched_entities) ? $enriched_entities[0]['name'] : 'Professional Service';
    }
    
    private function extract_service_type($text_parts, $enriched_entities) {
        $combined_text = strtolower($text_parts['title'] . ' ' . $text_parts['meta']);
        
        $service_types = [
            'assisted living' => 'Assisted living',
            'limo' => 'Limousine service',
            'limousine' => 'Limousine service',
            'transportation' => 'Transportation service',
            'chauffeur' => 'Chauffeur service',
            'car service' => 'Car service',
            'medical' => 'Medical service',
            'education' => 'Educational service',
            'consulting' => 'Consulting service'
        ];
        
        foreach ($service_types as $pattern => $type) {
            if (strpos($combined_text, $pattern) !== false) {
                return $type;
            }
        }
        
        return 'Professional service';
    }
    
    private function build_service_same_as($service_name, $service_type) {
        $same_as = array();
        
        // Add Wikipedia links for service types
        $wiki_mappings = [
            'Assisted living' => 'https://en.wikipedia.org/wiki/Assisted_living',
            'Limousine service' => 'https://en.wikipedia.org/wiki/Limousine',
            'Transportation service' => 'https://en.wikipedia.org/wiki/Transport',
            'Chauffeur service' => 'https://en.wikipedia.org/wiki/Chauffeur'
        ];
        
        if (isset($wiki_mappings[$service_type])) {
            $same_as[] = $wiki_mappings[$service_type];
        }
        
        // Add Wikidata links
        $wikidata_mappings = [
            'Assisted living' => 'https://www.wikidata.org/wiki/Q315412',
            'Limousine service' => 'https://www.wikidata.org/wiki/Q188475'
        ];
        
        if (isset($wikidata_mappings[$service_type])) {
            $same_as[] = $wikidata_mappings[$service_type];
        }
        
        return $same_as;
    }
    
    private function build_knows_about_array($enriched_entities, $main_topic) {
        $knows_about = array();
        
        // Focus on high-confidence entities related to the main topic
        $relevant_entities = array_filter($enriched_entities, function($entity) {
            return $entity['confidence_score'] > 60 && !empty($entity['wikipedia_url']);
        });
        
        foreach (array_slice($relevant_entities, 0, 12) as $entity) {
            $thing = array(
                '@type' => 'Thing',
                'name' => strtolower($entity['name'])
            );
            
            $same_as = array();
            if (!empty($entity['wikipedia_url'])) {
                $same_as[] = $entity['wikipedia_url'];
            }
            if (!empty($entity['google_kg_url'])) {
                $same_as[] = $entity['google_kg_url'];
            }
            
            if (!empty($same_as)) {
                $thing['sameAs'] = array_values($same_as);
            }
            
            $knows_about[] = $thing;
        }
        
        return $knows_about;
    }
    
    private function build_about_entities($enriched_entities) {
        $about_entities = array();
        
        foreach ($enriched_entities as $entity) {
            $same_as = array();
            
            if ($entity['wikipedia_url']) {
                $same_as[] = $entity['wikipedia_url'];
            }
            if ($entity['wikidata_url']) {
                $same_as[] = $entity['wikidata_url'];
            }
            if ($entity['google_kg_url']) {
                $same_as[] = $entity['google_kg_url'];
            }
            
            $thing = array(
                '@type' => 'Thing',
                'name' => $entity['name']
            );
            
            if ($entity['productontology_url']) {
                $thing['additionalType'] = $entity['productontology_url'];
            }
            
            if (!empty($same_as)) {
                $thing['sameAs'] = array_values($same_as);
            }
            
            $about_entities[] = $thing;
        }
        
        return $about_entities;
    }
    
    private function extract_additional_schemas($html_content) {
        $schemas = array(
            'author' => null,
            'organization' => null,
            'faq' => null,
            'howto' => null
        );
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        // Extract author information
        $schemas['author'] = $this->extract_author_schema($dom, $xpath);
        
        // Extract organization information
        $schemas['organization'] = $this->extract_organization_schema($dom, $xpath);
        
        // Extract FAQ schema
        $schemas['faq'] = $this->extract_faq_schema($dom, $xpath);
        
        // Extract HowTo schema
        $schemas['howto'] = $this->extract_howto_schema($dom, $xpath);
        
        return $schemas;
    }
    
    private function extract_author_schema($dom, $xpath) {
        $author_selectors = array(
            '//meta[@name="author"]',
            '//meta[@property="article:author"]',
            '//meta[@property="og:author"]',
            '//*[contains(@class, "author")]',
            '//*[contains(@id, "author")]',
            '//*[contains(@class, "byline")]',
            '//*[contains(@class, "writer")]',
            '//*[contains(@class, "contributor")]',
            '//*[@rel="author"]',
            '//*[contains(text(), "By ")]',
            '//*[contains(text(), "Author:")]',
            '//*[contains(text(), "Written by")]'
        );
        
        foreach ($author_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $author_name = $this->extract_author_name($node);
                    if ($author_name) {
                        return array(
                            '@type' => 'Person',
                            'name' => $author_name
                        );
                    }
                }
            }
        }
        
        return null;
    }
    
    private function extract_author_name($node) {
        // Handle meta tags
        if ($node->tagName === 'meta') {
            $content = $node->getAttribute('content');
            if (!empty($content)) {
                return trim($content);
            }
        }
        
        // Handle text content
        $text = trim($node->textContent);
        if (!empty($text)) {
            // Clean up common prefixes
            $text = preg_replace('/^(By|Author|Written by|Contributor):?\s*/i', '', $text);
            $text = trim($text);
            
            // Extract just the name (first few words)
            $words = explode(' ', $text);
            $name_words = array_slice($words, 0, 3); // Take first 3 words max
            $name = implode(' ', $name_words);
            
            if (strlen($name) > 2 && strlen($name) < 100) {
                return $name;
            }
        }
        
        return null;
    }
    
    private function extract_organization_schema($dom, $xpath) {
        $org_selectors = array(
            '//meta[@property="og:site_name"]',
            '//meta[@name="application-name"]',
            '//*[contains(@class, "logo")]',
            '//*[contains(@id, "logo")]',
            '//*[contains(@class, "brand")]',
            '//*[contains(@id, "brand")]',
            '//*[contains(@class, "company")]',
            '//*[contains(@id, "company")]',
            '//*[contains(@class, "organization")]',
            '//*[contains(@id, "organization")]',
            '//*[contains(@class, "site-title")]',
            '//*[contains(@class, "site-name")]'
        );
        
        foreach ($org_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $org_name = $this->extract_organization_name($node);
                    if ($org_name) {
                        return array(
                            '@type' => 'Organization',
                            'name' => $org_name
                        );
                    }
                }
            }
        }
        
        return null;
    }
    
    private function extract_organization_name($node) {
        // Handle meta tags
        if ($node->tagName === 'meta') {
            $content = $node->getAttribute('content');
            if (!empty($content)) {
                return trim($content);
            }
        }
        
        // Handle text content
        $text = trim($node->textContent);
        if (!empty($text) && strlen($text) > 2 && strlen($text) < 200) {
            return $text;
        }
        
        return null;
    }
    
    private function extract_faq_schema($dom, $xpath) {
        $faq_selectors = array(
            '//*[contains(@class, "faq")]',
            '//*[contains(@id, "faq")]',
            '//*[contains(@class, "faqs")]',
            '//*[contains(@id, "faqs")]',
            '//*[contains(@class, "questions")]',
            '//*[contains(@id, "questions")]',
            '//*[contains(@class, "answers")]',
            '//*[contains(@id, "answers")]',
            '//*[contains(@class, "accordion")]',
            '//*[contains(@id, "accordion")]',
            '//*[contains(@class, "collapse")]',
            '//*[contains(@id, "collapse")]',
            '//*[contains(text(), "Frequently Asked Questions")]',
            '//*[contains(text(), "FAQ")]',
            '//*[contains(text(), "Common Questions")]',
            '//*[contains(text(), "Q&A")]',
            '//*[contains(text(), "Questions and Answers")]'
        );
        
        $faq_items = array();
        
        foreach ($faq_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $items = $this->extract_faq_items_advanced($node, $xpath);
                    if (!empty($items)) {
                        $faq_items = array_merge($faq_items, $items);
                    }
                }
            }
        }
        
        // Also try to detect FAQ patterns in headings throughout the page
        $heading_faqs = $this->extract_faq_from_headings($dom, $xpath);
        if (!empty($heading_faqs)) {
            $faq_items = array_merge($faq_items, $heading_faqs);
        }
        
        // Remove duplicates and ensure quality
        $faq_items = $this->deduplicate_and_validate_faqs($faq_items);
        
        if (!empty($faq_items)) {
            return array(
                '@type' => 'FAQPage',
                'mainEntity' => array_slice($faq_items, 0, 15) // Increased limit for richer content
            );
        }
        
        return null;
    }
    
    private function extract_faq_items_advanced($container_node, $xpath) {
        $items = array();
        
        // Enhanced question selectors with more sophisticated patterns
        $question_selectors = array(
            './/h2', './/h3', './/h4', './/h5', './/h6',
            './/*[contains(@class, "question")]',
            './/*[contains(@class, "q")]',
            './/*[contains(@id, "question")]',
            './/*[contains(@id, "q")]',
            './/*[contains(@class, "faq-question")]',
            './/*[contains(@class, "accordion-title")]',
            './/*[contains(@class, "collapse-title")]',
            './/*[contains(@class, "toggle-title")]',
            './/*[@role="button"]',
            './/*[@aria-expanded]',
            './/dt', './/strong', './/b',
            './/*[starts-with(text(), "Q:")]',
            './/*[starts-with(text(), "Question:")]',
            './/*[contains(text(), "?") and string-length(text()) < 200]'
        );
        
        $questions = array();
        foreach ($question_selectors as $selector) {
            $nodes = $xpath->query($selector, $container_node);
            if ($nodes) {
                foreach ($nodes as $node) {
                    $question_text = trim($node->textContent);
                    if ($this->is_valid_faq_question($question_text)) {
                        $questions[] = array('node' => $node, 'text' => $question_text);
                    }
                }
            }
        }
        
        foreach ($questions as $question_data) {
            $question_node = $question_data['node'];
            $question_text = $question_data['text'];
            
            // Enhanced answer finding with multiple strategies
            $answer_data = $this->find_faq_answer_advanced($question_node, $xpath);
            
            if (!empty($answer_data['text'])) {
                $faq_item = array(
                    '@type' => 'Question',
                    'name' => $this->clean_faq_question($question_text),
                    'acceptedAnswer' => array(
                        '@type' => 'Answer',
                        'text' => $this->clean_faq_answer($answer_data['text'])
                    )
                );
                
                // Add enhanced metadata if available
                if (!empty($answer_data['author'])) {
                    $faq_item['acceptedAnswer']['author'] = array(
                        '@type' => 'Person',
                        'name' => $answer_data['author']
                    );
                }
                
                $items[] = $faq_item;
            }
        }
        
        return $items;
    }
    
    private function extract_faq_from_headings($dom, $xpath) {
        $items = array();
        
        // Look for question patterns in headings throughout the page
        $heading_nodes = $xpath->query('//h1 | //h2 | //h3 | //h4 | //h5 | //h6');
        
        foreach ($heading_nodes as $heading) {
            $heading_text = trim($heading->textContent);
            
            if ($this->is_valid_faq_question($heading_text)) {
                $answer_data = $this->find_faq_answer_advanced($heading, $xpath);
                
                if (!empty($answer_data['text']) && strlen($answer_data['text']) > 50) {
                    $items[] = array(
                        '@type' => 'Question',
                        'name' => $this->clean_faq_question($heading_text),
                        'acceptedAnswer' => array(
                            '@type' => 'Answer',
                            'text' => $this->clean_faq_answer($answer_data['text'])
                        )
                    );
                }
            }
        }
        
        return $items;
    }
    
    private function is_valid_faq_question($text) {
        if (empty($text) || strlen($text) < 10 || strlen($text) > 300) {
            return false;
        }
        
        // Must contain a question word or end with ?
        $question_patterns = array(
            '/\b(what|how|why|when|where|who|which|can|could|should|would|will|is|are|do|does|did)\b/i',
            '/\?$/',
            '/^Q:/i',
            '/^Question:/i'
        );
        
        foreach ($question_patterns as $pattern) {
            if (preg_match($pattern, $text)) {
                return true;
            }
        }
        
        return false;
    }
    
    private function clean_faq_question($text) {
        // Remove common prefixes and clean up
        $text = preg_replace('/^(Q:|Question:|FAQ:|#\d+\.?)\s*/i', '', $text);
        $text = trim($text);
        
        // Ensure it ends with a question mark if it's a question
        if (!preg_match('/[?!.]$/', $text) && preg_match('/\b(what|how|why|when|where|who|which|can|could|should|would|will|is|are|do|does|did)\b/i', $text)) {
            $text .= '?';
        }
        
        return $text;
    }
    
    private function clean_faq_answer($text) {
        // Remove common prefixes and clean up
        $text = preg_replace('/^(A:|Answer:|Response:)\s*/i', '', $text);
        $text = trim($text);
        
        // Remove excessive whitespace
        $text = preg_replace('/\s+/', ' ', $text);
        
        // Limit length for schema
        if (strlen($text) > 1500) {
            $text = substr($text, 0, 1500);
            $last_period = strrpos($text, '.');
            if ($last_period !== false && $last_period > 1000) {
                $text = substr($text, 0, $last_period + 1);
            } else {
                $text .= '...';
            }
        }
        
        return $text;
    }
    
    private function deduplicate_and_validate_faqs($faq_items) {
        $seen_questions = array();
        $unique_faqs = array();
        
        foreach ($faq_items as $item) {
            $question_key = strtolower(trim($item['name']));
            
            // Skip if we've seen this question before
            if (in_array($question_key, $seen_questions)) {
                continue;
            }
            
            // Skip if answer is too short or low quality
            $answer_text = $item['acceptedAnswer']['text'];
            if (strlen($answer_text) < 20 || 
                preg_match('/^(yes|no|maybe|ok|sure)\.?$/i', trim($answer_text))) {
                continue;
            }
            
            $seen_questions[] = $question_key;
            $unique_faqs[] = $item;
        }
        
        return $unique_faqs;
    }
    
    private function extract_howto_schema($dom, $xpath) {
        $howto_selectors = array(
            '//*[contains(@class, "how-to")]',
            '//*[contains(@id, "how-to")]',
            '//*[contains(@class, "howto")]',
            '//*[contains(@id, "howto")]',
            '//*[contains(@class, "tutorial")]',
            '//*[contains(@id, "tutorial")]',
            '//*[contains(@class, "guide")]',
            '//*[contains(@id, "guide")]',
            '//*[contains(@class, "instructions")]',
            '//*[contains(@id, "instructions")]',
            '//*[contains(@class, "steps")]',
            '//*[contains(@id, "steps")]',
            '//*[contains(@class, "procedure")]',
            '//*[contains(@id, "procedure")]',
            '//*[contains(@class, "process")]',
            '//*[contains(@id, "process")]',
            '//*[contains(text(), "How to")]',
            '//*[contains(text(), "Step by step")]',
            '//*[contains(text(), "Instructions")]',
            '//*[contains(text(), "Tutorial")]',
            '//*[contains(text(), "Guide")]'
        );
        
        foreach ($howto_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $howto = $this->extract_howto_content_advanced($node, $xpath);
                    if ($howto) {
                        return $howto;
                    }
                }
            }
        }
        
        // Also try to detect HowTo patterns from page structure
        $page_howto = $this->extract_howto_from_page_structure($dom, $xpath);
        if ($page_howto) {
            return $page_howto;
        }
        
        return null;
    }
    
    private function extract_howto_content_advanced($container_node, $xpath) {
        // Extract title with multiple strategies
        $title_selectors = array(
            './/h1', './/h2', './/h3',
            './/*[contains(@class, "title")]',
            './/*[contains(@class, "heading")]',
            './/*[contains(@class, "howto-title")]',
            './/*[contains(@class, "guide-title")]'
        );
        
        $title = '';
        $description = '';
        
        foreach ($title_selectors as $selector) {
            $nodes = $xpath->query($selector, $container_node);
            if ($nodes && $nodes->length > 0) {
                $title = trim($nodes->item(0)->textContent);
                break;
            }
        }
        
        if (empty($title)) {
            // Try to extract from page title if we're looking at the whole page
            $page_title = $xpath->query('//title')->item(0);
            if ($page_title) {
                $page_title_text = trim($page_title->textContent);
                if (preg_match('/how\s+to\s+(.+)/i', $page_title_text, $matches)) {
                    $title = 'How to ' . $matches[1];
                }
            }
        }
        
        if (empty($title)) {
            $title = 'How-to Guide';
        }
        
        // Extract description
        $description_selectors = array(
            './/*[contains(@class, "description")]',
            './/*[contains(@class, "intro")]',
            './/*[contains(@class, "overview")]',
            './/p[1]'
        );
        
        foreach ($description_selectors as $selector) {
            $nodes = $xpath->query($selector, $container_node);
            if ($nodes && $nodes->length > 0) {
                $desc = trim($nodes->item(0)->textContent);
                if (!empty($desc) && strlen($desc) > 30) {
                    $description = $desc;
                    break;
                }
            }
        }
        
        // Enhanced step extraction
        $steps = $this->extract_howto_steps_advanced($container_node, $xpath);
        
        if (!empty($steps)) {
            $howto = array(
                '@type' => 'HowTo',
                'name' => $title,
                'step' => $steps
            );
            
            if (!empty($description)) {
                $howto['description'] = $description;
            }
            
            // Add estimated time if detectable
            $time_info = $this->extract_howto_time_info($container_node, $xpath);
            if (!empty($time_info)) {
                $howto = array_merge($howto, $time_info);
            }
            
            // Add supply/tool requirements if detectable
            $supplies = $this->extract_howto_supplies($container_node, $xpath);
            if (!empty($supplies)) {
                $howto['supply'] = $supplies;
            }
            
            return $howto;
        }
        
        return null;
    }
    
    private function extract_howto_steps_advanced($container_node, $xpath) {
        $steps = array();
        
        // Enhanced step selectors
        $step_selectors = array(
            './/*[contains(@class, "step")]',
            './/*[contains(@id, "step")]',
            './/*[contains(@class, "instruction")]',
            './/*[contains(@class, "direction")]',
            './/*[contains(@class, "task")]',
            './/ol/li',
            './/ul/li[contains(@class, "step")]',
            './/*[starts-with(@class, "step-")]',
            './/*[contains(@data-step, "")]'
        );
        
        $found_steps = array();
        
        foreach ($step_selectors as $selector) {
            $nodes = $xpath->query($selector, $container_node);
            if ($nodes) {
                foreach ($nodes as $index => $node) {
                    $step_text = trim($node->textContent);
                    $step_name = '';
                    
                    // Try to extract step name from heading within step
                    $step_headings = $xpath->query('.//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6 | .//*[contains(@class, "step-title")]', $node);
                    if ($step_headings && $step_headings->length > 0) {
                        $step_name = trim($step_headings->item(0)->textContent);
                        // Remove the step name from the full text to get just the description
                        $step_text = str_replace($step_name, '', $step_text);
                        $step_text = trim($step_text);
                    }
                    
                    if (!empty($step_text) && strlen($step_text) > 15) {
                        $step_data = array(
                            '@type' => 'HowToStep',
                            'position' => count($found_steps) + 1,
                            'text' => $this->clean_howto_step_text($step_text)
                        );
                        
                        if (!empty($step_name)) {
                            $step_data['name'] = $this->clean_howto_step_name($step_name);
                        }
                        
                        // Look for images in this step
                        $step_images = $xpath->query('.//img', $node);
                        if ($step_images && $step_images->length > 0) {
                            $img = $step_images->item(0);
                            $img_src = $img->getAttribute('src');
                            $img_alt = $img->getAttribute('alt');
                            
                            if (!empty($img_src)) {
                                $step_data['image'] = array(
                                    '@type' => 'ImageObject',
                                    'url' => $img_src
                                );
                                
                                if (!empty($img_alt)) {
                                    $step_data['image']['caption'] = $img_alt;
                                }
                            }
                        }
                        
                        $found_steps[] = $step_data;
                    }
                }
                
                // If we found steps with this selector, use them
                if (!empty($found_steps)) {
                    break;
                }
            }
        }
        
        // If no structured steps found, try to extract from numbered text
        if (empty($found_steps)) {
            $found_steps = $this->extract_steps_from_text($container_node, $xpath);
        }
        
        return array_slice($found_steps, 0, 25); // Limit to 25 steps
    }
    
    private function extract_steps_from_text($container_node, $xpath) {
        $steps = array();
        $text_content = trim($container_node->textContent);
        
        // Look for numbered steps in text
        $step_patterns = array(
            '/(?:^|\n)\s*(\d+)[\.\)]\s*([^\n]+(?:\n(?!\s*\d+[\.\)]).*?)*)/m',
            '/(?:^|\n)\s*Step\s+(\d+):?\s*([^\n]+(?:\n(?!Step\s+\d+).*?)*)/mi'
        );
        
        foreach ($step_patterns as $pattern) {
            if (preg_match_all($pattern, $text_content, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $step_number = intval($match[1]);
                    $step_text = trim($match[2]);
                    
                    if (!empty($step_text) && strlen($step_text) > 15) {
                        $steps[] = array(
                            '@type' => 'HowToStep',
                            'position' => $step_number,
                            'text' => $this->clean_howto_step_text($step_text)
                        );
                    }
                }
                
                if (!empty($steps)) {
                    break;
                }
            }
        }
        
        return $steps;
    }
    
    private function extract_howto_from_page_structure($dom, $xpath) {
        // Look for HowTo patterns in page structure based on headings and content
        $main_heading = $xpath->query('//h1')->item(0);
        if (!$main_heading) {
            return null;
        }
        
        $title = trim($main_heading->textContent);
        
        // Check if this looks like a how-to guide
        if (!preg_match('/\b(how\s+to|guide|tutorial|instructions|steps)\b/i', $title)) {
            return null;
        }
        
        // Look for step-like headings (h2, h3 with step indicators)
        $step_headings = $xpath->query('//h2[contains(text(), "Step")] | //h3[contains(text(), "Step")] | //h2[starts-with(text(), "1.")] | //h2[starts-with(text(), "2.")] | //h3[starts-with(text(), "1.")] | //h3[starts-with(text(), "2.")]');
        
        if ($step_headings && $step_headings->length >= 2) {
            $steps = array();
            
            foreach ($step_headings as $index => $heading) {
                $step_title = trim($heading->textContent);
                $step_content = $this->get_content_until_next_heading($heading, $xpath);
                
                if (!empty($step_content)) {
                    $steps[] = array(
                        '@type' => 'HowToStep',
                        'position' => $index + 1,
                        'name' => $this->clean_howto_step_name($step_title),
                        'text' => $this->clean_howto_step_text($step_content)
                    );
                }
            }
            
            if (count($steps) >= 2) {
                return array(
                    '@type' => 'HowTo',
                    'name' => $title,
                    'step' => array_slice($steps, 0, 20)
                );
            }
        }
        
        return null;
    }
    
    private function get_content_until_next_heading($heading, $xpath) {
        $content = '';
        $next_element = $heading->nextSibling;
        
        while ($next_element) {
            if ($next_element->nodeType === XML_ELEMENT_NODE) {
                $tag_name = strtolower($next_element->nodeName);
                
                // Stop if we hit another heading
                if (preg_match('/^h[1-6]$/', $tag_name)) {
                    break;
                }
                
                $element_text = trim($next_element->textContent);
                if (!empty($element_text)) {
                    $content .= ' ' . $element_text;
                }
            }
            
            $next_element = $next_element->nextSibling;
        }
        
        return trim($content);
    }
    
    private function extract_howto_time_info($container_node, $xpath) {
        $time_info = array();
        
        // Look for time-related information
        $time_patterns = array(
            '/(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)/i',
            '/takes?\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)/i',
            '/in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)/i'
        );
        
        $content = trim($container_node->textContent);
        
        foreach ($time_patterns as $pattern) {
            if (preg_match($pattern, $content, $matches)) {
                $duration = intval($matches[1]);
                $unit = strtolower($matches[2]);
                
                // Convert to ISO 8601 duration format
                $iso_duration = 'PT';
                if (strpos($unit, 'hour') !== false || strpos($unit, 'hr') !== false) {
                    $iso_duration .= $duration . 'H';
                } elseif (strpos($unit, 'day') !== false) {
                    $iso_duration = 'P' . $duration . 'D';
                } else {
                    $iso_duration .= $duration . 'M';
                }
                
                $time_info['totalTime'] = $iso_duration;
                break;
            }
        }
        
        return $time_info;
    }
    
    private function extract_howto_supplies($container_node, $xpath) {
        $supplies = array();
        
        // Look for supply/tool lists
        $supply_selectors = array(
            './/*[contains(@class, "supplies")]//li',
            './/*[contains(@class, "tools")]//li',
            './/*[contains(@class, "materials")]//li',
            './/*[contains(@class, "equipment")]//li',
            './/*[contains(text(), "You will need:")]/following-sibling::ul//li',
            './/*[contains(text(), "Supplies:")]/following-sibling::ul//li',
            './/*[contains(text(), "Tools:")]/following-sibling::ul//li'
        );
        
        foreach ($supply_selectors as $selector) {
            $nodes = $xpath->query($selector, $container_node);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $supply_text = trim($node->textContent);
                    if (!empty($supply_text) && strlen($supply_text) < 100) {
                        $supplies[] = array(
                            '@type' => 'HowToSupply',
                            'name' => $supply_text
                        );
                    }
                }
                
                if (!empty($supplies)) {
                    break;
                }
            }
        }
        
        return array_slice($supplies, 0, 10); // Limit supplies
    }
    
    private function clean_howto_step_name($text) {
        // Clean step name
        $text = preg_replace('/^(Step\s*\d+:?\s*|#\d+\.?\s*)/i', '', $text);
        $text = trim($text);
        return $text;
    }
    
    private function clean_howto_step_text($text) {
        // Clean step text
        $text = preg_replace('/^(Step\s*\d+:?\s*|#\d+\.?\s*)/i', '', $text);
        $text = trim($text);
        
        // Remove excessive whitespace
        $text = preg_replace('/\s+/', ' ', $text);
        
        // Limit length
        if (strlen($text) > 1000) {
            $text = substr($text, 0, 1000);
            $last_period = strrpos($text, '.');
            if ($last_period !== false && $last_period > 800) {
                $text = substr($text, 0, $last_period + 1);
            } else {
                $text .= '...';
            }
        }
        
        return $text;
    }
    
    private function analyze_content($html_content, $enriched_entities, $json_ld = null) {
        // If OpenAI key is available, use the advanced recommendation engine.
        if (!empty($this->api_keys['openai'])) {
            return $this->generate_seo_recommendations_openai($html_content, $enriched_entities, $json_ld);
        }

        // Fallback to basic analysis if no API key.
        $text_content = $this->extract_text_from_html($html_content);
        $recommendations = array();
        
        $entity_names = array_column($enriched_entities, 'name');
        
        foreach ($entity_names as $entity) {
            $count = substr_count(strtolower($text_content['body']), strtolower($entity));
            if ($count <= 1) {
                $recommendations[] = "Consider expanding coverage of '{$entity}' with additional context, examples, or data to build more topical authority.";
            }
        }
        
        if (empty($recommendations)) {
            $recommendations[] = 'Content appears to have good entity coverage. Review the generated JSON-LD for inclusion in your page schema to improve SEO.';
        }
        
        return array_slice($recommendations, 0, 5);
    }

    private function generate_seo_recommendations_openai($html_content, $enriched_entities, $json_ld = null) {
        $text_content = $this->extract_text_from_html($html_content);
        
        $top_entities = array_slice(array_filter($enriched_entities, function($e) {
            return $e['confidence_score'] > 50;
        }), 0, 5);
        $entity_list_str = implode(', ', array_column($top_entities, 'name'));

        // Extract schema information to avoid redundant recommendations
        $implemented_schemas = array();
        $implemented_features = array();
        
        if (!empty($json_ld) && is_array($json_ld)) {
            // Detect implemented schema types
            if (isset($json_ld['@type'])) {
                $implemented_schemas[] = $json_ld['@type'];
            }
            if (isset($json_ld['mainEntity']) && is_array($json_ld['mainEntity'])) {
                foreach ($json_ld['mainEntity'] as $entity) {
                    if (isset($entity['@type'])) {
                        $implemented_schemas[] = $entity['@type'];
                    }
                }
            } elseif (isset($json_ld['mainEntity']['@type'])) {
                $implemented_schemas[] = $json_ld['mainEntity']['@type'];
            }
            
            // Detect implemented features
            if (isset($json_ld['hasPart'])) {
                $implemented_features[] = 'FAQ structured data';
            }
            if (isset($json_ld['speakable'])) {
                $implemented_features[] = 'Voice search optimization (speakable)';
            }
            if (isset($json_ld['provider'])) {
                $implemented_features[] = 'Provider/organization information';
            }
            if (isset($json_ld['knowsAbout'])) {
                $implemented_features[] = 'Knowledge domain specification';
            }
            if (isset($json_ld['sameAs'])) {
                $implemented_features[] = 'Entity linking (sameAs)';
            }
        }
        
        $schema_context = '';
        if (!empty($implemented_schemas) || !empty($implemented_features)) {
            $schema_info = array();
            if (!empty($implemented_schemas)) {
                $schema_info[] = 'Schema types: ' . implode(', ', array_unique($implemented_schemas));
            }
            if (!empty($implemented_features)) {
                $schema_info[] = 'Features: ' . implode(', ', array_unique($implemented_features));
            }
            $schema_context = "\n\n**Already Implemented Structured Data:**\n" . implode("\n", $schema_info) . "\n\n**IMPORTANT:** Do NOT recommend implementing any of the above schema types or features as they are already active on this page.";
        }

        $prompt = "You are a world-class Semantic SEO strategist, specializing in topical authority and schema optimization. Analyze the following webpage content and its most salient topical entities to provide expert, actionable recommendations for improving its semantic density and authority.

        **Page Text Summary:**
        " . substr($text_content['body'], 0, 2500) . "...

        **Most Salient Topical Entities Identified:**
        {$entity_list_str}{$schema_context}

        **Your Task:**
        Provide a structured set of recommendations in a JSON object format. The JSON object must contain a single key: `recommendations`. The value should be an array of objects, where each object has two keys: `category` (e.g., 'Semantic Gaps', 'Content Depth', 'Strategic Guidance') and `advice` (the specific recommendation string).

        Focus on content improvements, missing entity coverage, and advanced SEO strategies. Avoid recommending already-implemented structured data.

        Example:
        {
          \"recommendations\": [
            { \"category\": \"Semantic Gaps\", \"advice\": \"Cover the topic of 'Voice Search Optimization' as it's highly relevant.\" },
            { \"category\": \"Content Depth\", \"advice\": \"Expand on 'Local SEO' by including case studies and FAQs.\" }
          ]
        }

        Return *only* the raw JSON object, without any surrounding text, formatting, or explanations.";

        // Prepare the request data
        $request_data = array(
            'model' => 'gpt-4o',
            'messages' => array(
                array('role' => 'user', 'content' => $prompt)
            ),
            'max_tokens' => 1000,
            'temperature' => 0.3, // Lower temperature for more consistent results
            'response_format' => ['type' => 'json_object']
        );
        
        $json_body = json_encode($request_data);
        if ($json_body === false) {
            error_log('Ontologizer: Failed to encode JSON for OpenAI request');
            return array();
        }
        
        $response = wp_remote_post('https://api.openai.com/v1/chat/completions', array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->api_keys['openai'],
                'Content-Type' => 'application/json'
            ),
            'body' => $json_body,
            'timeout' => 45
        ));

        if (is_wp_error($response)) {
            error_log('Ontologizer: OpenAI API error - ' . $response->get_error_message());
            return $this->analyze_content_fallback($html_content, $enriched_entities, $json_ld); // Fallback to basic
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (isset($data['choices'][0]['message']['content'])) {
            $content = json_decode($data['choices'][0]['message']['content'], true);
            
            if (isset($content['recommendations']) && is_array($content['recommendations'])) {
                // Track token usage and cost
                if (isset($data['usage'])) {
                    $tokens = $data['usage']['total_tokens'] ?? 0;
                    $prompt_tokens = $data['usage']['prompt_tokens'] ?? 0;
                    $completion_tokens = $data['usage']['completion_tokens'] ?? 0;
                    $this->openai_token_usage += $tokens;
                    $cost = ($prompt_tokens * 0.000005) + ($completion_tokens * 0.000015);
                    $this->openai_cost_usd += $cost;
                }
                return $content['recommendations'];
            }
        }
        
        // Fallback if the response is not as expected
        return $this->analyze_content_fallback($html_content, $enriched_entities, $json_ld);
    }

    private function analyze_content_fallback($html_content, $enriched_entities, $json_ld = null) {
        $text_content = $this->extract_text_from_html($html_content);
        $recommendations = array();
        
        $entity_names = array_column($enriched_entities, 'name');
        
        foreach ($entity_names as $entity) {
            $count = substr_count(strtolower($text_content['body']), strtolower($entity));
            if ($count <= 1) {
                $recommendations[] = "Consider expanding coverage of '{$entity}' with additional context, examples, or data to build more topical authority.";
            }
        }
        
        if (empty($recommendations)) {
            $recommendations[] = 'Content appears to have good entity coverage. Review the generated JSON-LD for inclusion in your page schema to improve SEO.';
        }
        
        return array_slice($recommendations, 0, 5);
    }

    private function calculate_topical_salience_score($enriched_entities) {
        if (empty($enriched_entities)) {
            return 0;
        }

        $total_entities = count($enriched_entities);
        $sum_of_scores = array_sum(array_column($enriched_entities, 'confidence_score'));
        $high_confidence_count = count(array_filter($enriched_entities, function($e) {
            return $e['confidence_score'] >= 85;
        }));
        $kg_mid_count = count(array_filter($enriched_entities, function($e) {
            return strpos($e['google_kg_url'] ?? '', 'kgmid=') !== false;
        }));

        // Weighted score calculation
        $avg_score_component = ($sum_of_scores / $total_entities); // Max 100
        $high_confidence_component = ($high_confidence_count / $total_entities) * 100; // Max 100
        $kg_mid_component = ($kg_mid_count / $total_entities) * 100; // Max 100

        // Combine with weights: Average score is most important, then high confidence entities, then KG presence.
        $final_score = ($avg_score_component * 0.5) + ($high_confidence_component * 0.35) + ($kg_mid_component * 0.15);

        return round($final_score);
    }

    public function get_cache_summary($cache_data) {
        // Returns a summary for admin listing
        return array(
            'url' => $cache_data['url'] ?? '',
            'primary_topic' => $cache_data['primary_topic'] ?? '',
            'main_topic_confidence' => $cache_data['entities'][0]['confidence_score'] ?? 0,
            'topical_salience' => $cache_data['topical_salience'] ?? 0,
            'timestamp' => $cache_data['timestamp'] ?? '',
        );
    }

    public function identify_irrelevant_entities($enriched_entities, $main_topic) {
        // Improved topic-aware relevance detection
        $irrelevant = array();
        $main_topic_lc = strtolower($main_topic);
        
        // Define topic-specific relevance patterns
        $topic_relevance_patterns = [];
        
        // Limo/Transportation topic
        if (strpos($main_topic_lc, 'limo') !== false || strpos($main_topic_lc, 'transportation') !== false) {
            $topic_relevance_patterns = [
                '/airport/i', '/transportation/i', '/limo/i', '/chauffeur/i', '/car.?service/i',
                '/ground.?transportation/i', '/sedan/i', '/suv/i', '/vehicle/i', '/chicago/i',
                '/arrivals/i', '/meet.*greet/i', '/private/i', '/executive/i', '/luxury/i',
                '/echo/i', '/ohare/i', '/o.?hare/i', '/limousine/i', '/high.?end/i'
            ];
        }
        
        // SEO/Search topic
        if (strpos($main_topic_lc, 'seo') !== false || strpos($main_topic_lc, 'search') !== false) {
            $topic_relevance_patterns = [
                '/seo/i', '/search/i', '/ranking/i', '/optimization/i', '/markup/i', '/schema/i',
                '/visibility/i', '/traffic/i', '/google/i', '/analytics/i', '/html/i', '/javascript/i',
                '/ai.?search/i', '/faq/i', '/visibility.?test/i'
            ];
        }
        
        // Higher Education topic
        if (strpos($main_topic_lc, 'higher ed') !== false || strpos($main_topic_lc, 'education') !== false) {
            $topic_relevance_patterns = [
                '/university/i', '/college/i', '/education/i', '/academic/i', '/student/i',
                '/program/i', '/mba/i', '/enrollment/i', '/campus/i', '/degree/i'
            ];
        }
        
        foreach ($enriched_entities as $entity) {
            $entity_lc = strtolower($entity['name']);
            
            // Never flag high-confidence core entities as irrelevant
            if ($entity['confidence_score'] >= 80) {
                continue;
            }
            
            // Check topic relevance
            $is_topic_relevant = false;
            foreach ($topic_relevance_patterns as $pattern) {
                if (preg_match($pattern, $entity_lc)) {
                    $is_topic_relevant = true;
                    break;
                }
            }
            
            // Flag as irrelevant if:
            // 1. Low confidence AND not topic-relevant
            // 2. OR clearly from examples/case studies (universities in SEO articles, etc.)
            $is_example_entity = false;
            if (strpos($main_topic_lc, 'seo') !== false || strpos($main_topic_lc, 'search') !== false) {
                // In SEO articles, universities mentioned as examples are often irrelevant
                if (preg_match('/university|college|school.*business/i', $entity_lc) && 
                    !preg_match('/marketing|seo|search|digital/i', $entity_lc)) {
                    $is_example_entity = true;
                }
            }
            
            // Be more conservative - only flag as irrelevant if clearly off-topic
            if (($entity['confidence_score'] < 40 && !$is_topic_relevant) || $is_example_entity) {
                $irrelevant[] = $entity['name'];
            }
        }
        
        return $irrelevant;
    }

    public function get_salience_improvement_tips($main_topic, $irrelevant_entities) {
        $tips = array();
        $tips[] = "Increase the frequency and contextual relevance of your main topic ('{$main_topic}') throughout the content.";
        // Determine if main topic is a Person and if there are contextually relevant entities
        $contextual_types = ['cuisine', 'city', 'organization', 'restaurant', 'place', 'location', 'region', 'creative work', 'book', 'tv show'];
        $main_topic_type = null;
        if (isset($this->last_enriched_entities)) {
            foreach ($this->last_enriched_entities as $entity) {
                if (strcasecmp($entity['name'], $main_topic) === 0 && !empty($entity['type'])) {
                    $main_topic_type = $entity['type'];
                    break;
                }
            }
        }
        $contextual_entities = array();
        if (isset($this->last_enriched_entities)) {
            foreach ($this->last_enriched_entities as $entity) {
                $entity_type = strtolower($entity['type'] ?? '');
                if ($main_topic_type === 'person' && in_array($entity_type, $contextual_types)) {
                    $contextual_entities[] = $entity['name'];
                }
            }
        }
        if ($main_topic_type === 'person' && !empty($contextual_entities)) {
            $tips[] = "Strengthen the narrative connection to related entities like: " . implode(', ', $contextual_entities) . ". These entities provide essential context and support topical authority.";
        } elseif (!empty($irrelevant_entities)) {
            $tips[] = "Align or integrate related entities with your main topic where possible. Only consider removing content if it is truly irrelevant or off-topic: " . implode(', ', $irrelevant_entities) . ".";
        }
        $tips[] = "Add more detailed sections, examples, or FAQs about '{$main_topic}' to boost topical authority.";
        return $tips;
    }

    public function get_enriched_entities_with_irrelevance($enriched_entities, $main_topic) {
        $irrelevant = $this->identify_irrelevant_entities($enriched_entities, $main_topic);
        foreach ($enriched_entities as &$entity) {
            $entity['irrelevant'] = in_array($entity['name'], $irrelevant);
        }
        return $enriched_entities;
    }

    public function process_pasted_content($content, $main_topic_strategy = 'strict', $run_fanout_analysis = false) {
        // Step 1: Detect content type and convert to structured format
        $processed_content = $this->process_pasted_content_format($content);
        $html_content = $processed_content['html'];
        $content_type = $processed_content['type'];
        
        // Step 2: Extract named entities
        $start_time = microtime(true);
        $text_parts = $this->extract_text_from_html($html_content);
        
        // For markdown/plain text, we may have detected structure - use it
        if (!empty($processed_content['structured_text'])) {
            $text_parts = array_merge($text_parts, $processed_content['structured_text']);
        }
        
        $extraction_result = $this->extract_entities($html_content);
        if (is_array($extraction_result) && isset($extraction_result['entities'])) {
            $entities = $extraction_result['entities'];
            $openai_main_topic = $extraction_result['main_topic'] ?? '';
        } else {
            $entities = $extraction_result; // fallback for basic extraction
            $openai_main_topic = '';
        }
        error_log(sprintf('Ontologizer: Entity extraction (pasted %s) took %.2f seconds.', $content_type, microtime(true) - $start_time));
        
        // Step 3: Enrich entities with external data
        $start_time = microtime(true);
        $enriched_entities = $this->enrich_entities($entities);
        error_log(sprintf('Ontologizer: Entity enrichment (pasted %s) took %.2f seconds.', $content_type, microtime(true) - $start_time));
        
        // Step 4: Generate JSON-LD schema
        $json_ld = $this->generate_json_ld($enriched_entities, '', $html_content);
        
        // Step 5: Analyze content and provide recommendations
        $start_time = microtime(true);
        $recommendations = $this->analyze_content($html_content, $enriched_entities, $json_ld);
        error_log(sprintf('Ontologizer: Recommendation generation (pasted %s) took %.2f seconds.', $content_type, microtime(true) - $start_time));
        
        // Step 6: Calculate Topical Salience Score
        $topical_salience = $this->calculate_topical_salience_score($enriched_entities);
        
        // PRIORITIZE OpenAI main topic - only use PHP fallback if OpenAI fails
        $main_topic = $openai_main_topic;
        
        // Only use complex PHP logic as fallback if OpenAI didn't provide a main topic
        if (empty($main_topic)) {
            error_log('Ontologizer: OpenAI main topic empty for pasted content, using PHP fallback logic');
            
            // Use first entity as basic fallback
            $main_topic = $entities[0] ?? null;
            
            $search_fields = [strtolower($text_parts['title']), strtolower($text_parts['meta'])];
            foreach ($text_parts['headings'] as $h) { $search_fields[] = strtolower($h); }
            
            // Always prefer the longest capitalized phrase in the title that ends with Course/Program/Certificate/Workshop/Seminar
            $title_phrase = null;
            if (preg_match_all('/([A-Z][a-zA-Z]*(?: [A-Z][a-zA-Z]*)* (Course|Program|Certificate|Workshop|Seminar))/i', $text_parts['title'], $matches)) {
                if (!empty($matches[0])) {
                    usort($matches[0], function($a, $b) { return strlen($b) - strlen($a); });
                    $title_phrase = trim($matches[0][0]);
                }
            }
            if ($title_phrase) {
                $main_topic = $title_phrase;
            } else if ($main_topic_strategy === 'title') {
                // Use the longest entity/phrase that appears in the title
                $title_lc = strtolower($text_parts['title']);
                $candidates = array_filter($entities, function($e) use ($title_lc) {
                    return strpos($title_lc, strtolower($e)) !== false;
                });
                if (!empty($candidates)) {
                    usort($candidates, function($a, $b) { return strlen($b) - strlen($a); });
                    $main_topic = $candidates[0];
                }
            } else if ($main_topic_strategy === 'frequent') {
                // Use the most frequent entity/phrase in the body
                $body_lc = strtolower($text_parts['body']);
                $freqs = [];
                foreach ($entities as $e) {
                    $freqs[$e] = substr_count($body_lc, strtolower($e));
                }
                arsort($freqs);
                $main_topic = key($freqs);
            } else if ($main_topic_strategy === 'pattern') {
                // Use the page title if it matches a pattern (e.g., multi-word noun phrase)
                if (preg_match('/([A-Z][a-z]+( [A-Z][a-z]+)+)/', $text_parts['title'], $matches)) {
                    $main_topic = $matches[1];
                }
            }
        } else {
            error_log('Ontologizer: Using OpenAI main topic for pasted content: "' . $main_topic . '"');
        }
        
        $irrelevant_entities = [];
        foreach ($enriched_entities as $entity) {
            $entity_lc = strtolower($entity['name']);
            $in_title = strpos(strtolower($text_parts['title']), $entity_lc) !== false;
            $in_headings = false;
            foreach ($text_parts['headings'] as $h) { if (strpos(strtolower($h), $entity_lc) !== false) $in_headings = true; }
            $in_body = substr_count(strtolower($text_parts['body']), $entity_lc) > 1;
            if (!$in_title && !$in_headings && !$in_body) {
                $irrelevant_entities[] = $entity['name'];
            }
        }
        $salience_tips = $this->get_salience_improvement_tips($main_topic, $irrelevant_entities);
        
        // Run Gemini fan-out analysis if requested
        $fanout_analysis = null;
        if ($run_fanout_analysis && !empty($this->api_keys['gemini'])) {
            $start_time = microtime(true);
            $fanout_analysis = $this->generate_fanout_analysis($processed_content['html'], '');
            error_log(sprintf('Ontologizer: Fan-out analysis took %.2f seconds.', microtime(true) - $start_time));
        }
        
        $result = array(
            'url' => '',
            'entities' => $enriched_entities,
            'json_ld' => $json_ld,
            'recommendations' => $recommendations,
            'topical_salience' => $topical_salience,
            'primary_topic' => $main_topic,
            'main_topic_confidence' => !empty($enriched_entities) ? $enriched_entities[0]['confidence_score'] : 0,
            'salience_tips' => $salience_tips,
            'irrelevant_entities' => $irrelevant_entities,
            'processing_time' => microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'],
            'entities_count' => count($enriched_entities),
            'enriched_count' => count(array_filter($enriched_entities, function($e) {
                return !empty($e['wikipedia_url']) || !empty($e['wikidata_url']) || 
                       !empty($e['google_kg_url']) || !empty($e['productontology_url']);
            })),
            'cached' => false,
            'timestamp' => time(),
            'pasted_content' => true,
            'content_type' => $content_type,
            'page_title' => $text_parts['title'],
            'openai_token_usage' => $this->openai_token_usage,
            'openai_cost_usd' => round($this->openai_cost_usd, 6),
            'fanout_analysis' => $fanout_analysis,
        );
        
        return $result;
    }
    
    private function process_pasted_content_format($content) {
        $content = trim($content);
        $type = 'plain_text';
        $html = '';
        $structured_text = [];
        
        // Detect content type
        if ($this->is_markdown_content($content)) {
            $type = 'markdown';
            $parsed = $this->parse_markdown_content($content);
            $html = $parsed['html'];
            $structured_text = $parsed['structured_text'];
            error_log('Ontologizer: Detected markdown content');
        } elseif ($this->is_html_content($content)) {
            $type = 'html';
            $html = $content;
            error_log('Ontologizer: Detected HTML content');
        } else {
            $type = 'plain_text';
            $parsed = $this->parse_plain_text_content($content);
            $html = $parsed['html'];
            $structured_text = $parsed['structured_text'];
            error_log('Ontologizer: Detected plain text content');
        }
        
        return [
            'type' => $type,
            'html' => $html,
            'structured_text' => $structured_text
        ];
    }
    
    private function is_markdown_content($content) {
        // Check for common markdown patterns
        $markdown_patterns = [
            '/^#{1,6}\s+.+$/m',           // Headers (# ## ###)
            '/\*\*[^*]+\*\*/',            // Bold text
            '/\*[^*]+\*/',                // Italic text
            '/\[.+\]\(.+\)/',             // Links [text](url)
            '/```[\s\S]*?```/',           // Code blocks
            '/`[^`]+`/',                  // Inline code
            '/^\*\s+.+$/m',               // Unordered lists
            '/^\d+\.\s+.+$/m',            // Ordered lists
            '/^\>\s+.+$/m',               // Blockquotes
        ];
        
        $markdown_score = 0;
        foreach ($markdown_patterns as $pattern) {
            if (preg_match($pattern, $content)) {
                $markdown_score++;
            }
        }
        
        // Consider it markdown if it has 2+ markdown patterns
        return $markdown_score >= 2;
    }
    
    private function is_html_content($content) {
        // Check for HTML tags
        return preg_match('/<[^>]+>/', $content) && 
               (strpos($content, '<!DOCTYPE') !== false || 
                strpos($content, '<html') !== false || 
                strpos($content, '<body') !== false ||
                preg_match('/<(div|p|h[1-6]|span|a|img|table|ul|ol|li)\b[^>]*>/i', $content));
    }
    
    private function parse_markdown_content($content) {
        $html = '';
        $title = '';
        $headings = [];
        $body_parts = [];
        
        // Split content into lines for processing
        $lines = explode("\n", $content);
        $in_code_block = false;
        
        foreach ($lines as $line) {
            $line = trim($line);
            
            // Handle code blocks
            if (strpos($line, '```') === 0) {
                $in_code_block = !$in_code_block;
                continue;
            }
            
            if ($in_code_block) {
                continue; // Skip content inside code blocks
            }
            
            // Headers
            if (preg_match('/^(#{1,6})\s+(.+)$/', $line, $matches)) {
                $level = strlen($matches[1]);
                $header_text = trim($matches[2]);
                
                if ($level === 1 && empty($title)) {
                    $title = $header_text;
                } else {
                    $headings[] = $header_text;
                }
                $html .= "<h{$level}>" . htmlspecialchars($header_text) . "</h{$level}>\n";
            }
            // Bold text
            elseif (preg_match('/\*\*([^*]+)\*\*/', $line)) {
                $processed = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $line);
                $html .= "<p>" . htmlspecialchars($processed, ENT_NOQUOTES) . "</p>\n";
                $body_parts[] = strip_tags($processed);
            }
            // Italic text
            elseif (preg_match('/\*([^*]+)\*/', $line)) {
                $processed = preg_replace('/\*([^*]+)\*/', '<em>$1</em>', $line);
                $html .= "<p>" . htmlspecialchars($processed, ENT_NOQUOTES) . "</p>\n";
                $body_parts[] = strip_tags($processed);
            }
            // Links
            elseif (preg_match('/\[(.+?)\]\((.+?)\)/', $line)) {
                $processed = preg_replace('/\[(.+?)\]\((.+?)\)/', '<a href="$2">$1</a>', $line);
                $html .= "<p>" . $processed . "</p>\n";
                $body_parts[] = strip_tags($processed);
            }
            // Unordered lists
            elseif (preg_match('/^\*\s+(.+)$/', $line, $matches)) {
                $html .= "<li>" . htmlspecialchars($matches[1]) . "</li>\n";
                $body_parts[] = $matches[1];
            }
            // Ordered lists
            elseif (preg_match('/^\d+\.\s+(.+)$/', $line, $matches)) {
                $html .= "<li>" . htmlspecialchars($matches[1]) . "</li>\n";
                $body_parts[] = $matches[1];
            }
            // Blockquotes
            elseif (preg_match('/^\>\s+(.+)$/', $line, $matches)) {
                $html .= "<blockquote>" . htmlspecialchars($matches[1]) . "</blockquote>\n";
                $body_parts[] = $matches[1];
            }
            // Regular paragraphs
            elseif (!empty($line)) {
                $html .= "<p>" . htmlspecialchars($line) . "</p>\n";
                $body_parts[] = $line;
            }
        }
        
        // Wrap in basic HTML structure
        $full_html = "<html><head>";
        if ($title) {
            $full_html .= "<title>" . htmlspecialchars($title) . "</title>";
        }
        $full_html .= "</head><body>" . $html . "</body></html>";
        
        return [
            'html' => $full_html,
            'structured_text' => [
                'title' => $title,
                'headings' => $headings,
                'body' => implode(' ', $body_parts),
                'meta' => ''
            ]
        ];
    }
    
    private function parse_plain_text_content($content) {
        $lines = explode("\n", $content);
        $title = '';
        $headings = [];
        $body_parts = [];
        $html = '';
        
        foreach ($lines as $i => $line) {
            $line = trim($line);
            if (empty($line)) continue;
            
            // First non-empty line as title if it looks like a title
            if (empty($title) && (strlen($line) < 100 && !preg_match('/[.!?]$/', $line))) {
                $title = $line;
                $html .= "<h1>" . htmlspecialchars($line) . "</h1>\n";
            }
            // Lines that are short and don't end with punctuation might be headings
            elseif (strlen($line) < 80 && !preg_match('/[.!?]$/', $line) && 
                    preg_match('/^[A-Z]/', $line) && $i > 0) {
                $headings[] = $line;
                $html .= "<h2>" . htmlspecialchars($line) . "</h2>\n";
            }
            // Everything else is body content
            else {
                $body_parts[] = $line;
                $html .= "<p>" . htmlspecialchars($line) . "</p>\n";
            }
        }
        
        // Wrap in basic HTML structure
        $full_html = "<html><head>";
        if ($title) {
            $full_html .= "<title>" . htmlspecialchars($title) . "</title>";
        }
        $full_html .= "</head><body>" . $html . "</body></html>";
        
        return [
            'html' => $full_html,
            'structured_text' => [
                'title' => $title,
                'headings' => $headings,
                'body' => implode(' ', $body_parts),
                'meta' => ''
            ]
        ];
    }

    // Helper: Generate all unique pairs/triples of entities (orderings included)
    private static function get_entity_combinations($entities, $max_n = 3) {
        $results = [];
        $n = count($entities);
        for ($size = 2; $size <= $max_n; $size++) {
            $indexes = range(0, $n - 1);
            $combos = self::combinations($indexes, $size);
            foreach ($combos as $combo) {
                $perms = self::permutations($combo);
                foreach ($perms as $perm) {
                    $results[] = array_map(function($i) use ($entities) { return $entities[$i]; }, $perm);
                }
            }
        }
        return $results;
    }
    // Helper: All k-combinations of an array
    private static function combinations($arr, $k) {
        $result = [];
        $n = count($arr);
        if ($k == 0) return [[]];
        for ($i = 0; $i <= $n - $k; $i++) {
            $head = [$arr[$i]];
            $tail = self::combinations(array_slice($arr, $i + 1), $k - 1);
            foreach ($tail as $t) {
                $result[] = array_merge($head, $t);
            }
        }
        return $result;
    }
    // Helper: All permutations of an array
    private static function permutations($arr) {
        if (count($arr) <= 1) return [$arr];
        $result = [];
        foreach ($arr as $i => $v) {
            $rest = $arr;
            unset($rest[$i]);
            foreach (self::permutations(array_values($rest)) as $p) {
                array_unshift($p, $v);
                $result[] = $p;
            }
        }
        return $result;
    }

    // Add this new helper function to detect entity type
    private function detect_entity_type($enriched_entity) {
        // Try to infer type from URLs or names
        if (!empty($enriched_entity['wikidata_url'])) {
            $wikidata_id = basename($enriched_entity['wikidata_url']);
            // Use Wikidata API to get type (instance of)
            $api_url = 'https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' . urlencode($wikidata_id) . '&property=P31&format=json';
            $response = wp_remote_get($api_url, array('timeout' => 10));
            if (!is_wp_error($response)) {
                $body = wp_remote_retrieve_body($response);
                $data = json_decode($body, true);
                if (isset($data['claims']['P31'][0]['mainsnak']['datavalue']['value']['id'])) {
                    $instance_id = $data['claims']['P31'][0]['mainsnak']['datavalue']['value']['id'];
                    // Map some common Wikidata types
                    $type_map = [
                        'Q5' => 'person', // human
                        'Q43229' => 'organization',
                        'Q4830453' => 'business',
                        'Q3918' => 'university',
                        'Q95074' => 'company',
                        'Q16521' => 'taxon',
                        'Q571' => 'book',
                        'Q11424' => 'film',
                        'Q13442814' => 'scholarly article',
                        'Q12737077' => 'course',
                        // Add more as needed
                    ];
                    if (isset($type_map[$instance_id])) {
                        return $type_map[$instance_id];
                    }
                }
            }
        }
        // Fallback: guess from name
        if (preg_match('/^[A-Z][a-z]+ [A-Z][a-z]+$/', $enriched_entity['name'])) {
            return 'person';
        }
        if (stripos($enriched_entity['name'], 'university') !== false || stripos($enriched_entity['name'], 'school') !== false) {
            return 'organization';
        }
        if (stripos($enriched_entity['name'], 'course') !== false) {
            return 'course';
        }
        return null;
    }

    private function get_cached_entity($entity_name) {
        $cache_key = 'ontologizer_entity_' . md5(strtolower($entity_name));
        $cached = get_transient($cache_key);
        
        if ($cached !== false) {
            error_log("Ontologizer: Using cached data for entity: '$entity_name'");
            return $cached;
        }
        
        return false;
    }
    
    private function cache_entity($entity_name, $enriched_data) {
        // Only cache entities with high confidence and multiple sources
        $total_sources = 0;
        $min_confidence = 80;
        $has_high_confidence = false;
        
        if (!empty($enriched_data['wikipedia_url'])) $total_sources++;
        if (!empty($enriched_data['wikidata_url'])) $total_sources++;
        if (!empty($enriched_data['google_kg_url'])) $total_sources++;
        if (!empty($enriched_data['product_ontology_url'])) $total_sources++;
        
        // Check if any source has high confidence
        if ($enriched_data['confidence'] >= $min_confidence) {
            $has_high_confidence = true;
        }
        
        // Cache if we have 2+ sources and high confidence
        if ($total_sources >= 2 && $has_high_confidence) {
            $cache_key = 'ontologizer_entity_' . md5(strtolower($entity_name));
            $cache_duration = 7 * DAY_IN_SECONDS; // Cache for 1 week
            
            set_transient($cache_key, $enriched_data, $cache_duration);
            error_log("Ontologizer: Cached entity '$entity_name' with $total_sources sources and {$enriched_data['confidence_score']}% confidence");
        }
    }
    
    public function clear_entity_cache() {
        global $wpdb;
        
        // Clear all Ontologizer entity cache entries
        $cache_keys = $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE '_transient_ontologizer_entity_%'");
        
        $cleared_count = 0;
        foreach ($cache_keys as $key) {
            // Remove the '_transient_' prefix to get the actual transient key
            $transient_key = str_replace('_transient_', '', $key);
            if (delete_transient($transient_key)) {
                $cleared_count++;
            }
        }
        
        error_log("Ontologizer: Cleared $cleared_count cached entities");
        return $cleared_count;
    }
    
    public function get_cache_stats() {
        global $wpdb;
        
        $cache_keys = $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE '_transient_ontologizer_entity_%'");
        
        return [
            'cached_entities' => count($cache_keys),
            'cache_size_bytes' => $wpdb->get_var("SELECT SUM(LENGTH(option_value)) FROM {$wpdb->options} WHERE option_name LIKE '_transient_ontologizer_entity_%'")
        ];
    }

         private function find_faq_answer_advanced($question_node, $xpath) {
         $answer_data = array('text' => '', 'author' => '');
         
         // Strategy 1: Look for accordion/collapse content
         $accordion_targets = array(
             './following-sibling::*[contains(@class, "collapse")]',
             './following-sibling::*[contains(@class, "accordion-content")]',
             './following-sibling::*[contains(@class, "answer")]',
             './following-sibling::*[contains(@class, "faq-answer")]',
             './following-sibling::*[@aria-expanded]',
             './parent::*/following-sibling::*[contains(@class, "answer")]'
         );
         
         foreach ($accordion_targets as $target) {
             $nodes = $xpath->query($target, $question_node);
             if ($nodes && $nodes->length > 0) {
                 $text = trim($nodes->item(0)->textContent);
                 if (!empty($text) && strlen($text) > 20) {
                     $answer_data['text'] = $text;
                     
                     // Look for author in answer
                     $author_nodes = $xpath->query('.//*[contains(@class, "author")]', $nodes->item(0));
                     if ($author_nodes && $author_nodes->length > 0) {
                         $answer_data['author'] = trim($author_nodes->item(0)->textContent);
                     }
                     
                     return $answer_data;
                 }
             }
         }
         
         // Strategy 2: Look for immediate siblings
         $next_sibling = $question_node->nextSibling;
         while ($next_sibling) {
             if ($next_sibling->nodeType === XML_ELEMENT_NODE) {
                 $text = trim($next_sibling->textContent);
                 if (!empty($text) && strlen($text) > 20) {
                     $answer_data['text'] = $text;
                     return $answer_data;
                 }
             }
             $next_sibling = $next_sibling->nextSibling;
         }
         
         // Strategy 3: Look for following elements
         $following_elements = $xpath->query('following-sibling::*[position()<=3]', $question_node);
         if ($following_elements) {
             foreach ($following_elements as $element) {
                 $text = trim($element->textContent);
                 if (!empty($text) && strlen($text) > 20) {
                     $answer_data['text'] = $text;
                     return $answer_data;
                 }
             }
         }
         
         // Strategy 4: Look for content in same container
         $parent = $question_node->parentNode;
         if ($parent) {
             $children = $parent->childNodes;
             $found_question = false;
             
             foreach ($children as $child) {
                 if ($child === $question_node) {
                     $found_question = true;
                     continue;
                 }
                 
                 if ($found_question && $child->nodeType === XML_ELEMENT_NODE) {
                     $text = trim($child->textContent);
                     if (!empty($text) && strlen($text) > 20) {
                         $answer_data['text'] = $text;
                         return $answer_data;
                     }
                 }
             }
         }
         
         return $answer_data;
     }

    private function extract_business_name($text_parts, $enriched_entities) {
        // Try to extract business name from title or copyright
        if (!empty($text_parts['title'])) {
            // Remove common suffixes and clean up
            $title = preg_replace('/\s*[-|]\s*.+$/', '', $text_parts['title']);
            $title = preg_replace('/\s*\|\s*.+$/', '', $title);
            return trim($title);
        }
        
        return !empty($enriched_entities) ? $enriched_entities[0]['name'] : 'Local Business';
    }
    
    private function extract_program_name($text_parts, $enriched_entities) {
        if (!empty($text_parts['title'])) {
            return $text_parts['title'];
        }
        
        return !empty($enriched_entities) ? $enriched_entities[0]['name'] : 'Educational Program';
    }
    
    private function extract_contact_information($html_content) {
        $contact_info = array();
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        // Extract phone numbers
        $phone_patterns = [
            '/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/',
            '/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/',
            '/\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/'
        ];
        
        $content_text = $dom->textContent;
        foreach ($phone_patterns as $pattern) {
            if (preg_match($pattern, $content_text, $matches)) {
                $contact_info['telephone'] = trim($matches[0]);
                break;
            }
        }
        
        // Extract address information
        $address_selectors = [
            '//*[contains(@class, "address")]',
            '//*[contains(@id, "address")]',
            '//*[contains(@class, "location")]',
            '//*[contains(@class, "contact")]'
        ];
        
        foreach ($address_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                $address_text = trim($nodes->item(0)->textContent);
                if (strlen($address_text) > 10 && strlen($address_text) < 200) {
                    $parsed_address = $this->parse_address($address_text);
                    if (!empty($parsed_address)) {
                        $contact_info['address'] = $parsed_address;
                        break;
                    }
                }
            }
        }
        
        return $contact_info;
    }
    
    private function parse_address($address_text) {
        // Basic address parsing - can be enhanced
        $address = array('@type' => 'PostalAddress');
        
        // Extract ZIP code
        if (preg_match('/\b\d{5}(-\d{4})?\b/', $address_text, $matches)) {
            $address['postalCode'] = $matches[0];
        }
        
        // Extract state (2-letter codes)
        if (preg_match('/\b[A-Z]{2}\b/', $address_text, $matches)) {
            $address['addressRegion'] = $matches[0];
        }
        
        // Extract country
        if (strpos(strtolower($address_text), 'usa') !== false || 
            strpos(strtolower($address_text), 'united states') !== false) {
            $address['addressCountry'] = 'US';
        }
        
        // Basic street address extraction (everything before city/state)
        $clean_address = preg_replace('/\b\d{5}(-\d{4})?\b.*$/', '', $address_text);
        $clean_address = preg_replace('/\b[A-Z]{2}\b.*$/', '', $clean_address);
        $clean_address = trim($clean_address);
        
        if (!empty($clean_address)) {
            $parts = explode(',', $clean_address);
            if (count($parts) >= 2) {
                $address['streetAddress'] = trim($parts[0]);
                $address['addressLocality'] = trim($parts[1]);
            } else {
                $address['streetAddress'] = $clean_address;
            }
        }
        
        return count($address) > 1 ? $address : array();
    }
    
    private function extract_business_services($text_parts, $enriched_entities) {
        $services = array();
        
        // Look for service-related entities
        $service_keywords = ['service', 'services', 'offering', 'solution', 'care', 'support'];
        
        foreach ($enriched_entities as $entity) {
            $entity_lower = strtolower($entity['name']);
            
            foreach ($service_keywords as $keyword) {
                if (strpos($entity_lower, $keyword) !== false && $entity['confidence_score'] > 50) {
                    $services[] = array(
                        '@type' => 'Offer',
                        'itemOffered' => array(
                            '@type' => 'Service',
                            'name' => $entity['name'],
                            'description' => $this->generate_service_description($entity['name'])
                        )
                    );
                    break;
                }
            }
        }
        
        return array_slice($services, 0, 5); // Limit to 5 services
    }
    
    private function generate_service_description($service_name) {
        $descriptions = [
            'limo service' => 'A luxury transportation option featuring stretch limousines or high-end vehicles, often booked for special occasions like weddings, proms, or corporate events.',
            'car service' => 'A professional, pre-arranged ground transportation service using private vehicles.',
            'chauffeur service' => 'A premium, full-service transportation experience where a professionally trained driver caters to your itinerary.',
            'assisted living' => 'Residential care for seniors who need help with activities of daily living but want to maintain their independence.'
        ];
        
        $service_lower = strtolower($service_name);
        foreach ($descriptions as $key => $desc) {
            if (strpos($service_lower, $key) !== false) {
                return $desc;
            }
        }
        
        return "Professional {$service_name} provided with expertise and care.";
    }
    
    private function extract_service_provider($text_parts, $enriched_entities, $html_content) {
        $provider = array('@type' => 'LocalBusiness');
        
        // Extract provider name
        $provider_name = $this->extract_business_name($text_parts, $enriched_entities);
        $provider['name'] = $provider_name;
        
        // Add URL
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        $canonical = $xpath->query('//link[@rel="canonical"]')->item(0);
        if ($canonical) {
            $provider['url'] = $canonical->getAttribute('href');
        }
        
        // Extract contact information
        $contact_info = $this->extract_contact_information($html_content);
        if (!empty($contact_info)) {
            $provider = array_merge($provider, $contact_info);
        }
        
        // Add description if available
        if (!empty($text_parts['meta'])) {
            $provider['description'] = $text_parts['meta'];
        }
        
        return $provider;
    }
    
    private function extract_educational_provider($text_parts, $enriched_entities, $html_content) {
        $provider = array('@type' => 'CollegeOrUniversity');
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        // Look for educational institution names
        $provider_name = '';
        foreach ($enriched_entities as $entity) {
            $entity_lower = strtolower($entity['name']);
            if (preg_match('/\b(university|college|academy|institute|school)\b/', $entity_lower)) {
                $provider_name = $entity['name'];
                $provider['name'] = $entity['name'];
                break;
            }
        }
        
        if (!isset($provider['name'])) {
            $provider_name = $this->extract_business_name($text_parts, $enriched_entities);
            $provider['name'] = $provider_name;
        }
        
        // Add alternate names
        $alternate_names = array();
        if (preg_match('/\b([A-Z]{2,5})\b/', $provider_name, $matches)) {
            $alternate_names[] = $matches[1]; // Acronym
        }
        
        // Look for common alternate names in content
        $content_text = $dom->textContent;
        if (preg_match('/(?:also known as|aka|formerly)\s+([^.]+)/i', $content_text, $matches)) {
            $alternate_names[] = trim($matches[1]);
        }
        
        if (!empty($alternate_names)) {
            $provider['alternateName'] = $alternate_names;
        }
        
        // Add comprehensive description
        if (!empty($text_parts['meta'])) {
            $provider['description'] = $text_parts['meta'];
        }
        
        // Enhanced description with more context
        $description_parts = array();
        if (!empty($text_parts['meta'])) {
            $description_parts[] = $text_parts['meta'];
        }
        
        // Look for mission statement or about section
        $about_selectors = array(
            '//*[contains(@class, "about")]',
            '//*[contains(@class, "mission")]',
            '//*[contains(@class, "description")]',
            '//*[contains(text(), "established")]',
            '//*[contains(text(), "founded")]',
            '//*[contains(text(), "since")]'
        );
        
        foreach ($about_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                $text = trim($nodes->item(0)->textContent);
                if (strlen($text) > 50 && strlen($text) < 500) {
                    $description_parts[] = $text;
                    break;
                }
            }
        }
        
        if (count($description_parts) > 1) {
            $provider['disambiguatingDescription'] = implode(' ', array_slice($description_parts, 1));
        }
        
        // Add URL
        $canonical = $xpath->query('//link[@rel="canonical"]')->item(0);
        if ($canonical) {
            $provider['url'] = $canonical->getAttribute('href');
        }
        
        // Add logo
        $logo_selectors = array(
            '//meta[@property="og:image"]/@content',
            '//*[contains(@class, "logo")]//img/@src',
            '//*[contains(@id, "logo")]//img/@src',
            '//img[contains(@alt, "logo")]/@src'
        );
        
        foreach ($logo_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                $logo_url = trim($nodes->item(0)->nodeValue);
                if (!empty($logo_url) && filter_var($logo_url, FILTER_VALIDATE_URL)) {
                    $provider['logo'] = $logo_url;
                    break;
                }
            }
        }
        
        // Add contact information
        $contact_info = $this->extract_contact_information($html_content);
        if (!empty($contact_info)) {
            $provider = array_merge($provider, $contact_info);
        }
        
        // Build comprehensive sameAs array
        $same_as = $this->build_comprehensive_same_as($provider_name, $html_content);
        
        // Add educational institution specific URLs
        if (!empty($provider_name)) {
            // Add generic search URLs for the institution
            $same_as[] = 'https://www.google.com/search?q=' . urlencode($provider_name);
            
            // Look for specific educational databases
            $provider_lower = strtolower($provider_name);
            if (strpos($provider_lower, 'medical') !== false || strpos($provider_lower, 'health') !== false) {
                $same_as[] = 'https://www.google.com/search?q=' . urlencode($provider_name . ' accreditation');
            }
        }
        
        if (!empty($same_as)) {
            $provider['sameAs'] = array_values(array_unique($same_as));
        }
        
        // Add knowsAbout based on educational entities
        $knows_about = array();
        foreach ($enriched_entities as $entity) {
            if ($entity['confidence_score'] > 70 && !empty($entity['wikipedia_url'])) {
                $entity_lower = strtolower($entity['name']);
                if (preg_match('/\b(education|medical|health|training|program|course|degree|diploma|certification)\b/', $entity_lower)) {
                    $thing = array(
                        '@type' => 'Thing',
                        'name' => strtolower($entity['name'])
                    );
                    
                    $thing_same_as = array();
                    if (!empty($entity['wikipedia_url'])) {
                        $thing_same_as[] = $entity['wikipedia_url'];
                    }
                    if (!empty($entity['google_kg_url'])) {
                        $thing_same_as[] = $entity['google_kg_url'];
                    }
                    
                    if (!empty($thing_same_as)) {
                        $thing['sameAs'] = array_values($thing_same_as);
                    }
                    
                    $knows_about[] = $thing;
                }
            }
        }
        
        if (!empty($knows_about)) {
            $provider['knowsAbout'] = array_slice($knows_about, 0, 8);
        }
        
        // Add additional type classifications
        $additional_types = array();
        $provider_lower = strtolower($provider_name);
        
        if (strpos($provider_lower, 'medical') !== false || strpos($provider_lower, 'health') !== false) {
            $additional_types[] = 'http://www.productontology.org/doc/Health_education';
        }
        
        if (preg_match('/\b(vocational|technical|career)\b/', $provider_lower)) {
            $additional_types[] = 'http://www.productontology.org/doc/Vocational_school';
        }
        
        if (!empty($additional_types)) {
            $provider['additionalType'] = $additional_types;
        }
        
        // Add identifier if we can generate a knowledge graph reference
        foreach ($enriched_entities as $entity) {
            if (strtolower($entity['name']) === strtolower($provider_name) && !empty($entity['google_kg_url'])) {
                $provider['identifier'] = $entity['google_kg_url'];
                break;
            }
        }
        
        // Add geographic service area
        if (!empty($contact_info['address']['addressRegion'])) {
            $state = $contact_info['address']['addressRegion'];
            $provider['areaServed'] = array(
                array(
                    '@type' => 'Place',
                    'name' => 'United States of America',
                    'sameAs' => array(
                        'https://en.wikipedia.org/wiki/United_States',
                        'https://www.wikidata.org/wiki/Q30',
                        'https://www.google.com/search?kgmid=/m/09c7w0'
                    )
                )
            );
            
            // Add specific state if available
            if (strlen($state) === 2) {
                $state_name = $this->get_state_name($state);
                if ($state_name) {
                    $provider['areaServed'][] = array(
                        '@type' => 'Place',
                        'name' => $state_name,
                        'sameAs' => array(
                            'https://www.google.com/search?q=' . urlencode($state_name)
                        )
                    );
                }
            }
        }
        
        // Add awards if mentioned in content
        $awards = $this->extract_awards($content_text);
        if (!empty($awards)) {
            $provider['award'] = $awards;
        }
        
        return $provider;
    }
    
    private function extract_program_details($html_content) {
        $details = array();
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $content_text = $dom->textContent;
        
        // Extract duration
        $duration_patterns = [
            '/(\d+)\s*months?/i',
            '/(\d+)\s*years?/i',
            '/(\d+)\s*weeks?/i'
        ];
        
        foreach ($duration_patterns as $pattern) {
            if (preg_match($pattern, $content_text, $matches)) {
                $number = $matches[1];
                $unit = strtolower($matches[0]);
                
                if (strpos($unit, 'month') !== false) {
                    $details['timeToComplete'] = 'P' . $number . 'M';
                } elseif (strpos($unit, 'year') !== false) {
                    $details['timeToComplete'] = 'P' . $number . 'Y';
                } elseif (strpos($unit, 'week') !== false) {
                    $details['timeToComplete'] = 'P' . $number . 'W';
                }
                break;
            }
        }
        
        // Extract credits
        if (preg_match('/(\d+)\s*credits?/i', $content_text, $matches)) {
            $details['numberOfCredits'] = intval($matches[1]);
        }
        
        // Extract program type
        if (preg_match('/\b(diploma|degree|certificate|certification)\b/i', $content_text, $matches)) {
            $details['educationalCredentialAwarded'] = array(
                '@type' => 'EducationalOccupationalCredential',
                'credentialCategory' => ucfirst(strtolower($matches[1]))
            );
        }
        
        // Extract delivery mode
        if (preg_match('/\b(online|on-campus|hybrid|blended)\b/i', $content_text, $matches)) {
            $details['educationalProgramMode'] = strtolower($matches[1]);
        }
        
        return $details;
    }
    
    private function build_comprehensive_same_as($business_name, $html_content) {
        $same_as = array();
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        // Look for social media links
        $social_selectors = [
            '//a[contains(@href, "facebook.com")]/@href',
            '//a[contains(@href, "twitter.com")]/@href',
            '//a[contains(@href, "linkedin.com")]/@href',
            '//a[contains(@href, "instagram.com")]/@href',
            '//a[contains(@href, "youtube.com")]/@href',
            '//a[contains(@href, "yelp.com")]/@href',
            '//a[contains(@href, "google.com/maps")]/@href'
        ];
        
        foreach ($social_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes && $nodes->length > 0) {
                foreach ($nodes as $node) {
                    $url = trim($node->nodeValue);
                    if (!empty($url) && filter_var($url, FILTER_VALIDATE_URL)) {
                        $same_as[] = $url;
                    }
                }
            }
        }
        
        // Use array_values to ensure sequential indices for proper JSON array encoding
        return array_values(array_unique($same_as));
    }
    
    private function get_state_name($state_code) {
        $states = array(
            'AL' => 'Alabama', 'AK' => 'Alaska', 'AZ' => 'Arizona', 'AR' => 'Arkansas',
            'CA' => 'California', 'CO' => 'Colorado', 'CT' => 'Connecticut', 'DE' => 'Delaware',
            'FL' => 'Florida', 'GA' => 'Georgia', 'HI' => 'Hawaii', 'ID' => 'Idaho',
            'IL' => 'Illinois', 'IN' => 'Indiana', 'IA' => 'Iowa', 'KS' => 'Kansas',
            'KY' => 'Kentucky', 'LA' => 'Louisiana', 'ME' => 'Maine', 'MD' => 'Maryland',
            'MA' => 'Massachusetts', 'MI' => 'Michigan', 'MN' => 'Minnesota', 'MS' => 'Mississippi',
            'MO' => 'Missouri', 'MT' => 'Montana', 'NE' => 'Nebraska', 'NV' => 'Nevada',
            'NH' => 'New Hampshire', 'NJ' => 'New Jersey', 'NM' => 'New Mexico', 'NY' => 'New York',
            'NC' => 'North Carolina', 'ND' => 'North Dakota', 'OH' => 'Ohio', 'OK' => 'Oklahoma',
            'OR' => 'Oregon', 'PA' => 'Pennsylvania', 'RI' => 'Rhode Island', 'SC' => 'South Carolina',
            'SD' => 'South Dakota', 'TN' => 'Tennessee', 'TX' => 'Texas', 'UT' => 'Utah',
            'VT' => 'Vermont', 'VA' => 'Virginia', 'WA' => 'Washington', 'WV' => 'West Virginia',
            'WI' => 'Wisconsin', 'WY' => 'Wyoming'
        );
        
        return isset($states[$state_code]) ? $states[$state_code] : null;
    }
    
    private function extract_awards($content_text) {
        $awards = array();
        
        // Look for award patterns in the content
        $award_patterns = array(
            '/(?:awarded?|received?|earned?|recognized|winner of|recipient of)\s+([^.]+(?:award|recognition|honor|prize|medal|certification|accreditation)[^.]*)/i',
            '/([^.]*(?:award|recognition|honor|prize|medal)\s+(?:winner|recipient|holder)[^.]*)/i',
            '/(\d{4}\s+[^.]*(?:award|recognition|honor|prize|medal|accreditation)[^.]*)/i'
        );
        
        foreach ($award_patterns as $pattern) {
            if (preg_match_all($pattern, $content_text, $matches)) {
                foreach ($matches[1] as $match) {
                    $award = trim($match);
                    if (strlen($award) > 10 && strlen($award) < 200) {
                        $awards[] = $award;
                    }
                }
            }
        }
        
        // Remove duplicates and limit
        return array_slice(array_unique($awards), 0, 6);
    }
    
    private function extract_multiple_programs($html_content, $program_name, $page_url, $text_parts) {
        $programs = array();
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $content_text = $dom->textContent;
        
        // Look for multiple program types
        $program_patterns = array(
            'diploma' => '/\b(diploma|certificate)\s+(?:in\s+)?([^.]+)/i',
            'associate' => '/\bassociate\s+(?:degree|program)\s+(?:in\s+)?([^.]+)/i',
            'bachelor' => '/\bbachelor\'?s?\s+(?:degree|program)\s+(?:in\s+)?([^.]+)/i',
            'master' => '/\bmaster\'?s?\s+(?:degree|program)\s+(?:in\s+)?([^.]+)/i'
        );
        
        foreach ($program_patterns as $type => $pattern) {
            if (preg_match_all($pattern, $content_text, $matches)) {
                foreach ($matches[0] as $index => $match) {
                    $program_title = trim($matches[0][$index]);
                    if (strlen($program_title) > 10 && strlen($program_title) < 150) {
                        
                        $program = array(
                            '@type' => 'EducationalOccupationalProgram',
                            'name' => $program_title,
                            'url' => $page_url
                        );
                        
                        // Add basic description
                        if (!empty($text_parts['meta'])) {
                            $program['description'] = $text_parts['meta'];
                        }
                        
                        // Add enhanced description specific to this program type
                        $enhanced_description = $this->generate_program_description($type, $program_name);
                        if (!empty($enhanced_description)) {
                            $program['disambiguatingDescription'] = $enhanced_description;
                        }
                        
                        // Extract specific details for this program
                        $program_details = $this->extract_specific_program_details($content_text, $type);
                        if (!empty($program_details)) {
                            $program = array_merge($program, $program_details);
                        }
                        
                        // Add program type
                        $program['programType'] = $this->get_program_type($type);
                        
                        // Add credential information
                        $credential = $this->get_credential_info($type, $program_name);
                        if (!empty($credential)) {
                            $program['educationalCredentialAwarded'] = $credential;
                        }
                        
                        // Add knowledge graph identifiers
                        $program['identifier'] = 'https://www.google.com/search?kgmid=/m/03lm52'; // Medical billing KG
                        $program['additionalType'] = 'http://www.productontology.org/id/Medical_billing';
                        
                        $programs[] = $program;
                    }
                }
            }
        }
        
        // If no specific programs found, try to detect generic program structure
        if (empty($programs)) {
            $programs = $this->detect_generic_programs($content_text, $program_name, $page_url, $text_parts);
        }
        
        return array_slice($programs, 0, 3); // Limit to 3 programs max
    }
    
    private function generate_program_description($type, $program_name) {
        $base_description = "Medical billing involves preparing and submitting claims to insurance providers or other payers for reimbursement. Medical coding converts healthcare diagnoses, treatments, services, and equipment into standardized alphanumeric codes. The program includes comprehensive training in healthcare terminology, insurance claims processing, diagnostic coding, procedural coding, and related topics.";
        
        switch ($type) {
            case 'diploma':
                return "Medical billing is the process of sending a bill for payment to an insurance company or another payer. Medical coding is the transformation of healthcare diagnosis procedures, medical services, and equipment into universal alphanumeric codes. The curriculum covers medical terminology, insurance billing, diagnostic codes, medical procedures, and more.";
            case 'associate':
                return $base_description;
            default:
                return $base_description;
        }
    }
    
    private function extract_specific_program_details($content_text, $type) {
        $details = array();
        
        // Extract duration based on program type
        switch ($type) {
            case 'diploma':
                if (preg_match('/diploma.*?(\d+)\s*months?/i', $content_text, $matches)) {
                    $details['timeToComplete'] = 'P' . $matches[1] . 'M';
                }
                // Default diploma duration if not found
                if (!isset($details['timeToComplete'])) {
                    $details['timeToComplete'] = 'P11M';
                }
                // Look for diploma credits
                if (preg_match('/diploma.*?(\d+)\s*credits?/i', $content_text, $matches)) {
                    $details['numberOfCredits'] = intval($matches[1]);
                } else {
                    $details['numberOfCredits'] = 39; // Default for diploma
                }
                break;
                
            case 'associate':
                if (preg_match('/associate.*?(\d+)\s*(?:months?|years?)/i', $content_text, $matches)) {
                    $number = intval($matches[1]);
                    if (strpos($matches[0], 'year') !== false) {
                        $details['timeToComplete'] = 'P' . $number . 'Y';
                    } else {
                        $details['timeToComplete'] = 'P' . $number . 'M';
                    }
                }
                // Default associate duration if not found
                if (!isset($details['timeToComplete'])) {
                    $details['timeToComplete'] = 'P1Y6M';
                }
                // Look for associate credits
                if (preg_match('/associate.*?(\d+)\s*credits?/i', $content_text, $matches)) {
                    $details['numberOfCredits'] = intval($matches[1]);
                } else {
                    $details['numberOfCredits'] = 63; // Default for associate
                }
                break;
        }
        
        // Extract delivery mode
        if (preg_match('/\b(online|on-campus|hybrid|blended)\b/i', $content_text, $matches)) {
            $details['educationalProgramMode'] = strtolower($matches[1]);
        } else {
            $details['educationalProgramMode'] = 'online'; // Default
        }
        
        // Add prerequisites
        $details['programPrerequisites'] = array(
            '@type' => 'EducationalOccupationalCredential',
            'credentialCategory' => 'High School Diploma'
        );
        
        return $details;
    }
    
    private function get_program_type($type) {
        switch ($type) {
            case 'diploma':
                return 'Medical Billing and Coding Diploma Program';
            case 'associate':
                return 'AssociateProgram';
            case 'bachelor':
                return 'BachelorProgram';
            case 'master':
                return 'MasterProgram';
            default:
                return 'Educational Program';
        }
    }
    
    private function get_credential_info($type, $program_name) {
        switch ($type) {
            case 'diploma':
                return array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Diploma in Medical Billing and Coding'
                );
            case 'associate':
                return array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Associate Degree in Medical Billing and Coding'
                );
            case 'bachelor':
                return array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Bachelor Degree'
                );
            case 'master':
                return array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Master Degree'
                );
            default:
                return array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Certificate'
                );
        }
    }
    
    private function detect_generic_programs($content_text, $program_name, $page_url, $text_parts) {
        $programs = array();
        
        // If content mentions both diploma and degree options
        if (preg_match('/\b(?:diploma|certificate)\b/i', $content_text) && 
            preg_match('/\b(?:associate|degree)\b/i', $content_text)) {
            
            // Create diploma program
            $diploma_program = array(
                '@type' => 'EducationalOccupationalProgram',
                'name' => 'Medical Billing and Coding Diploma Program',
                'description' => 'Medical billing is the process of sending a bill for payment to an insurance company or another payer. Medical coding is the transformation of healthcare diagnosis procedures, medical services, and equipment into universal alphanumeric codes. The curriculum covers medical terminology, insurance billing, diagnostic codes, medical procedures, and more.',
                'url' => $page_url,
                'timeToComplete' => 'P11M',
                'numberOfCredits' => 39,
                'programType' => 'Medical Billing and Coding Diploma Program',
                'educationalProgramMode' => 'online',
                'educationalCredentialAwarded' => array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Diploma in Medical Billing and Coding'
                ),
                'programPrerequisites' => array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'High School Diploma'
                ),
                'identifier' => 'https://www.google.com/search?kgmid=/m/03lm52',
                'additionalType' => 'http://www.productontology.org/id/Medical_billing'
            );
            
            // Create associate degree program
            $associate_program = array(
                '@type' => 'EducationalOccupationalProgram',
                'name' => 'Medical Billing and Coding Associate Degree Program',
                'description' => 'Medical billing is the process of sending a bill for payment to an insurance company or another payer. Medical coding is the transformation of healthcare diagnosis procedures, medical services, and equipment into universal alphanumeric codes. The curriculum covers medical terminology, insurance billing, diagnostic codes, medical procedures, and more.',
                'url' => $page_url,
                'disambiguatingDescription' => 'Medical billing involves preparing and submitting claims to insurance providers or other payers for reimbursement. Medical coding converts healthcare diagnoses, treatments, services, and equipment into standardized alphanumeric codes. The program includes comprehensive training in healthcare terminology, insurance claims processing, diagnostic coding, procedural coding, and related topics.',
                'timeToComplete' => 'P1Y6M',
                'numberOfCredits' => 63,
                'programType' => 'AssociateProgram',
                'educationalProgramMode' => 'online',
                'educationalCredentialAwarded' => array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'Associate Degree in Medical Billing and Coding'
                ),
                'programPrerequisites' => array(
                    '@type' => 'EducationalOccupationalCredential',
                    'credentialCategory' => 'High School Diploma'
                ),
                'identifier' => 'https://www.google.com/search?kgmid=/m/03lm52',
                'additionalType' => 'http://www.productontology.org/id/Medical_billing'
            );
            
            $programs[] = $diploma_program;
            $programs[] = $associate_program;
        }
        
                 return $programs;
     }
     
     private function extract_video_object($html_content) {
         $dom = new DOMDocument();
         @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
         $xpath = new DOMXPath($dom);
         
         // Look for YouTube or Vimeo embeds
         $video_selectors = array(
             '//iframe[contains(@src, "youtube.com")]',
             '//iframe[contains(@src, "vimeo.com")]',
             '//video',
             '//embed[contains(@src, "youtube.com")]'
         );
         
         foreach ($video_selectors as $selector) {
             $nodes = $xpath->query($selector);
             if ($nodes && $nodes->length > 0) {
                 $video_node = $nodes->item(0);
                 $src = $video_node->getAttribute('src');
                 
                 if (!empty($src) && (strpos($src, 'youtube.com') !== false || strpos($src, 'vimeo.com') !== false)) {
                     $video = array('@type' => 'VideoObject');
                     
                     // Extract video title from title attribute or nearby text
                     $title = $video_node->getAttribute('title');
                     if (empty($title)) {
                         // Look for nearby headings or titles
                         $parent = $video_node->parentNode;
                         $title_nodes = $xpath->query('.//h1 | .//h2 | .//h3', $parent);
                         if ($title_nodes && $title_nodes->length > 0) {
                             $title = trim($title_nodes->item(0)->textContent);
                         }
                     }
                     
                     if (!empty($title)) {
                         $video['name'] = $title;
                     }
                     
                     // Convert embed URL to content URL for YouTube
                     if (strpos($src, 'youtube.com/embed/') !== false) {
                         $video_id = str_replace('https://www.youtube.com/embed/', '', $src);
                         $video_id = explode('?', $video_id)[0]; // Remove parameters
                         
                         $video['contentUrl'] = 'https://www.youtube.com/watch?v=' . $video_id;
                         $video['embedUrl'] = $src;
                         $video['thumbnailUrl'] = 'https://i.ytimg.com/vi/' . $video_id . '/maxresdefault.jpg';
                     }
                     
                     // Add description if available
                     $description_node = $xpath->query('./following-sibling::*[contains(@class, "description") or contains(@class, "caption")]', $video_node);
                     if ($description_node && $description_node->length > 0) {
                         $description = trim($description_node->item(0)->textContent);
                         if (!empty($description)) {
                             $video['description'] = $description;
                         }
                     }
                     
                     return $video;
                 }
             }
         }
         
         return null;
     }
     
     private function extract_significant_links($html_content) {
         $dom = new DOMDocument();
         @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
         $xpath = new DOMXPath($dom);
         
         $significant_links = array();
         
         // Look for important internal links
         $link_selectors = array(
             '//a[contains(@href, "blog")]',
             '//a[contains(@href, "guide")]',
             '//a[contains(@href, "how-to")]',
             '//a[contains(@href, "career")]',
             '//a[contains(@href, "program")]',
             '//a[contains(text(), "learn more")]',
             '//a[contains(text(), "read more")]',
             '//a[contains(text(), "guide")]',
             '//a[contains(text(), "career")]'
         );
         
         foreach ($link_selectors as $selector) {
             $nodes = $xpath->query($selector);
             if ($nodes && $nodes->length > 0) {
                 foreach ($nodes as $link) {
                     $href = $link->getAttribute('href');
                     $text = trim($link->textContent);
                     
                     if (!empty($href) && !empty($text) && strlen($text) > 5) {
                         // Make sure it's a full URL
                         if (strpos($href, 'http') === 0) {
                             $significant_links[] = $href;
                         }
                     }
                 }
             }
         }
         
         // Return first significant link found
         return !empty($significant_links) ? $significant_links[0] : null;
     }

    /**
     * Process fan-out analysis only for pasted content
     */
    public function process_fanout_analysis_only($content) {
        @set_time_limit(180);
        
        $processed_content = $this->process_pasted_content_format($content);
        $fanout_analysis = $this->generate_fanout_analysis($processed_content['html'], '');
        
        return array(
            'fanout_only' => true,
            'fanout_analysis' => $fanout_analysis,
            'processing_time' => microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'],
            'timestamp' => time(),
        );
    }

    /**
     * Process fan-out analysis only for URL
     */
    public function process_fanout_analysis_only_url($url) {
        @set_time_limit(180);
        
        // Validate URL
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new Exception('Invalid URL format provided');
        }
        
        // Fetch webpage
        $html_content = $this->fetch_webpage($url);
        if (!$html_content) {
            throw new Exception('Failed to fetch webpage content. Please check the URL and try again.');
        }
        
        $fanout_analysis = $this->generate_fanout_analysis($html_content, $url);
        
        return array(
            'url' => $url,
            'fanout_only' => true,
            'fanout_analysis' => $fanout_analysis,
            'processing_time' => microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'],
            'timestamp' => time(),
        );
    }

    /**
     * Generate Google AI Mode query fan-out analysis using Gemini API
     */
    private function generate_fanout_analysis($html_content, $url = '') {
        if (empty($this->api_keys['gemini'])) {
            return array(
                'error' => 'Gemini API key not configured'
            );
        }

        // Extract semantic chunks from HTML
        $chunks = $this->extract_semantic_chunks($html_content);
        
        // Create comprehensive prompt for Gemini
        $prompt = $this->build_fanout_prompt($chunks, $url);
        
        // Call Gemini API
        $response = $this->call_gemini_api($prompt);
        
        if (!$response || isset($response['error'])) {
            return array(
                'error' => $response['error'] ?? 'Failed to generate fan-out analysis',
                'chunks_extracted' => count($chunks)
            );
        }
        
        return array(
            'analysis' => $response,
            'chunks_extracted' => count($chunks),
            'chunks' => $chunks
        );
    }

    /**
     * Extract semantic chunks from HTML content (layout-aware chunking)
     */
    private function extract_semantic_chunks($html_content) {
        $chunks = [];
        
        if (empty($html_content)) {
            return $chunks;
        }
        
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html_content);
        $xpath = new DOMXPath($dom);
        
        // Extract title and main heading
        $title = '';
        $h1 = '';
        
        $title_nodes = $dom->getElementsByTagName('title');
        if ($title_nodes->length > 0) {
            $title = trim($title_nodes->item(0)->textContent);
        }
        
        $h1_nodes = $dom->getElementsByTagName('h1');
        if ($h1_nodes->length > 0) {
            $h1 = trim($h1_nodes->item(0)->textContent);
        }
        
        if ($title || $h1) {
            $chunks[] = array(
                'type' => 'primary_topic',
                'content' => trim($title . ' ' . $h1)
            );
        }
        
        // Extract headings and their content (layout-aware chunking)
        $heading_nodes = $xpath->query('//h2 | //h3');
        foreach ($heading_nodes as $heading) {
            $heading_text = trim($heading->textContent);
            $section_content = '';
            
            // Get content until next heading of same or higher level
            $current_level = intval(substr($heading->tagName, 1));
            $next_sibling = $heading->nextSibling;
            
            while ($next_sibling) {
                if ($next_sibling->nodeType === XML_ELEMENT_NODE) {
                    $tag_name = strtolower($next_sibling->tagName);
                    
                    // Stop if we hit another heading of same or higher level
                    if (preg_match('/^h[1-6]$/', $tag_name)) {
                        $sibling_level = intval(substr($tag_name, 1));
                        if ($sibling_level <= $current_level) {
                            break;
                        }
                    }
                    
                    $text = trim($next_sibling->textContent);
                    if ($text) {
                        $section_content .= ' ' . $text;
                    }
                }
                $next_sibling = $next_sibling->nextSibling;
            }
            
            if ($section_content) {
                $chunks[] = array(
                    'type' => 'section',
                    'heading' => $heading_text,
                    'content' => trim(substr($section_content, 0, 500))
                );
            }
        }
        
        // Extract key lists and FAQs
        $list_nodes = $xpath->query('//ul | //ol');
        $list_count = 0;
        foreach ($list_nodes as $list) {
            if ($list_count >= 5) break; // Limit to 5 lists
            
            $list_items = $xpath->query('.//li', $list);
            if ($list_items->length > 2) {
                $items = array();
                foreach ($list_items as $item) {
                    $items[] = trim($item->textContent);
                }
                
                $chunks[] = array(
                    'type' => 'list',
                    'content' => substr(implode(' | ', $items), 0, 300)
                );
                $list_count++;
            }
        }
        
        // Extract schema.org data if present
        $schema_nodes = $xpath->query('//script[@type="application/ld+json"]');
        foreach ($schema_nodes as $schema) {
            try {
                $data = json_decode($schema->textContent, true);
                if (isset($data['@type'])) {
                    $chunks[] = array(
                        'type' => 'structured_data',
                        'content' => sprintf('Type: %s, %s', 
                            $data['@type'], 
                            substr(json_encode($data), 0, 200)
                        )
                    );
                }
            } catch (Exception $e) {
                // Ignore JSON parse errors
            }
        }
        
        return $chunks;
    }

    /**
     * Build comprehensive prompt for Gemini
     */
    private function build_fanout_prompt($chunks, $url = '') {
        $url_text = $url ? "URL: $url\n\n" : '';
        
        $prompt = "You are analyzing a webpage for Google's AI Mode query fan-out potential. Google's AI Mode decomposes user queries into multiple sub-queries to synthesize comprehensive answers.\n\n";
        
        $prompt .= $url_text;
        
        $prompt .= "SEMANTIC CHUNKS FROM PAGE:\n";
        $prompt .= json_encode($chunks, JSON_PRETTY_PRINT) . "\n\n";
        
        $prompt .= "Based on this content, perform the following analysis:\n\n";
        $prompt .= "1. IDENTIFY PRIMARY ENTITY: What is the main ontological entity or topic of this page?\n\n";
        $prompt .= "2. PREDICT FAN-OUT QUERIES: Generate 8-10 likely sub-queries that Google's AI might create when a user asks about this topic. Consider:\n";
        $prompt .= "   - Related queries (broader context)\n";
        $prompt .= "   - Implicit queries (unstated user needs)\n";
        $prompt .= "   - Comparative queries (alternatives, comparisons)\n";
        $prompt .= "   - Procedural queries (how-to aspects)\n";
        $prompt .= "   - Contextual refinements (budget, size, location specifics)\n\n";
        $prompt .= "3. SEMANTIC COVERAGE SCORE: For each predicted query, assess if the page content provides information to answer it (Yes/Partial/No).\n\n";
        $prompt .= "4. FOLLOW-UP QUESTION POTENTIAL: What follow-up questions would users likely ask after reading this content?\n\n";
        $prompt .= "OUTPUT FORMAT:\n";
        $prompt .= "PRIMARY ENTITY: [entity name]\n\n";
        $prompt .= "FAN-OUT QUERIES:\n";
        $prompt .= "• [Query 1] - Coverage: [Yes/Partial/No]\n";
        $prompt .= "• [Query 2] - Coverage: [Yes/Partial/No]\n";
        $prompt .= "...\n\n";
        $prompt .= "FOLLOW-UP POTENTIAL:\n";
        $prompt .= "• [Follow-up question 1]\n";
        $prompt .= "• [Follow-up question 2]\n";
        $prompt .= "...\n\n";
        $prompt .= "COVERAGE SCORE: [X/10 queries covered]\n";
        $prompt .= "RECOMMENDATIONS: [Specific content gaps to fill]";
        
        return $prompt;
    }

    /**
     * Call Gemini API
     */
    private function call_gemini_api($prompt) {
        $api_key = $this->api_keys['gemini'];
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . urlencode($api_key);
        
        $request_data = array(
            'contents' => array(
                array(
                    'parts' => array(
                        array('text' => $prompt)
                    )
                )
            ),
            'generationConfig' => array(
                'temperature' => 0.3,
                'topK' => 20,
                'topP' => 0.9,
                'maxOutputTokens' => 2048
            )
        );
        
        $response = wp_remote_post($url, array(
            'timeout' => 60,
            'headers' => array(
                'Content-Type' => 'application/json'
            ),
            'body' => json_encode($request_data)
        ));
        
        if (is_wp_error($response)) {
            error_log('Ontologizer Gemini API Error: ' . $response->get_error_message());
            return array('error' => 'API request failed: ' . $response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        if ($status_code !== 200) {
            error_log('Ontologizer Gemini API HTTP Error: ' . $status_code . ' - ' . $body);
            return array('error' => "API error: HTTP $status_code");
        }
        
        $data = json_decode($body, true);
        
        if (!$data || !isset($data['candidates'][0]['content']['parts'][0]['text'])) {
            error_log('Ontologizer Gemini API Invalid Response: ' . $body);
            return array('error' => 'Invalid API response format');
        }
        
        $analysis = $data['candidates'][0]['content']['parts'][0]['text'];
        
        return $analysis;
    }
}  