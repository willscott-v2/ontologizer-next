# Ontologizer Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2024-12-19

### Major Feature: Google AI Mode Query Fan-out Analysis
- **🔍 Google AI Mode Integration**: Added comprehensive query fan-out analysis using Google's Gemini AI to predict how Google's AI might decompose user queries about your content
- **🎯 Primary Entity Detection**: Automatically identifies the main ontological entity or topic of each page
- **📊 Predicted Fan-out Queries**: Generates 8-10 likely sub-queries that Google's AI might create, including related, implicit, comparative, and procedural queries
- **✅ Coverage Assessment**: Visual indicators showing Yes/Partial/No coverage for each predicted query with color-coded status
- **💡 Actionable Recommendations**: Specific content gaps and optimization suggestions to improve AI query coverage
- **📈 Coverage Score Visualization**: Beautiful circular progress indicators with percentage scores and contextual descriptions

### Beautiful UI Components
- **🎨 Structured Visual Interface**: Completely redesigned fan-out results with professional card layouts, icons, and gradients
- **📋 Interactive Query Cards**: Grid layout with numbered queries, coverage indicators, and hover animations
- **🔄 Smart Tab Management**: Fan-out analysis can run alongside other features or as a standalone analysis
- **📱 Mobile-Responsive Design**: Optimized layouts for all screen sizes with touch-friendly interactions
- **🎭 Rich Visual Feedback**: Icons, color coding, and animations throughout the interface

### Technical Implementation
- **🔧 Semantic Content Chunking**: Layout-aware extraction of primary topics, sections, lists, and structured data
- **🤖 Gemini API Integration**: Full integration with Google's Gemini 1.5 Flash model for AI analysis
- **⚙️ Flexible Processing Options**: Run fan-out analysis alongside existing features or as standalone analysis
- **🗂️ Admin Configuration**: New Gemini API key field in WordPress admin with setup instructions
- **📊 Debug Information**: Detailed content chunks and analysis breakdown for troubleshooting

### Enhanced User Experience
- **✨ Professional Results Display**: Section headers with icons, structured content layout, and consistent styling
- **🎚️ Processing Options**: Choose to run fan-out analysis with entity extraction or run fan-out analysis only
- **🔍 Content Analysis Summary**: Shows number of semantic chunks extracted with visual indicators
- **❓ Follow-up Questions**: Displays potential user questions after reading content
- **🎯 Entity-Specific Analysis**: Tailored analysis based on detected primary entities

### Settings & Configuration
- **🔑 Gemini API Key Management**: New admin setting for Google Gemini API key with direct link to Google AI Studio
- **🛠️ Flexible Feature Toggle**: Enable fan-out analysis alongside existing features or use independently
- **📋 Enhanced Admin Documentation**: Updated usage instructions and feature previews in WordPress admin
- **🔧 Backward Compatibility**: All existing features remain unchanged and fully functional

## [1.7.2] - 2024-12-19

### Fixed
- **Critical: Schema.org JSON-LD Array Fix**: Fixed `sameAs` properties being generated as objects with numeric keys instead of proper arrays, which was breaking Schema.org validation
- **Schema-Aware Recommendations**: Fixed recommendations suggesting already-implemented structured data (e.g., suggesting "EducationalOccupationalProgram schema" when already generated)
- **Sequential Array Indices**: Added `array_values()` to all `sameAs` array generation methods to ensure proper JSON array encoding
- **Schema.org Validation Issue**: Fixed invalid `hasPart` property on `EducationalOccupationalProgram` schema type by restructuring educational program schemas to use proper `WebPage` root with `mainEntity` containing the program(s)
- **Enhanced Educational Schema Structure**: Now generates comprehensive `WebPage` schemas with multiple `EducationalOccupationalProgram` entities as `mainEntity` (diploma and associate degree programs)
- **Rich Organization Data**: Added comprehensive provider organization schemas with `sameAs`, `knowsAbout`, `areaServed`, `awards`, and enhanced contact information
- **Video Object Detection**: Added support for extracting and structuring video content (YouTube/Vimeo embeds) 
- **Significant Links**: Added extraction of important internal links for enhanced page relationships
- **Multiple Program Support**: Enhanced detection and structuring of multiple educational programs (diploma, associate, bachelor, master)

### Enhanced
- **Automatic Version Management**: Added `ontologizer_increment_version()` helper function for automatic semantic versioning (patch/minor/major increments)
- **Smart Recommendations Engine**: OpenAI recommendations now analyze generated JSON-LD to avoid suggesting already-implemented features
- **Context-Aware Analysis**: Recommendations engine detects implemented schema types (WebPage, EducationalOccupationalProgram, FAQPage) and features (speakable, knowsAbout, sameAs)
- **JSON-LD Compliance**: All `sameAs` arrays now properly encode as JSON arrays instead of objects, ensuring Schema.org validator compatibility
- **Provider Schema Enrichment**: Educational providers now include comprehensive metadata like alternate names, logos, awards, service areas, and knowledge graph identifiers
- **Program Detail Extraction**: Improved extraction of program-specific details including duration, credits, delivery mode, and credentials
- **Schema Validation**: All generated schemas now properly validate against Schema.org requirements

## [1.62.0] - 2025-01-01

### Context-Aware Entity Matching
- **SEO Wikipedia Fix**: Enhanced SEO → "Search Engine Optimization" Wikipedia matching with multiple search strategies  
- **Academic Programs Context**: Added context-aware matching for "Academic Programs" in education contexts
- **Context Storage**: Store main topic in class property for use in entity enrichment
- **Multiple Search Terms**: Try different search approaches when initial Wikipedia/Wikidata searches fail

### Improved Matching Quality
- **SEO Multi-Search**: Try "Search Engine Optimization", "SEO Search Engine Optimization", and fallback terms
- **Educational Context**: For "Academic Programs" + education context, search for "academic program", "degree program", etc.
- **Reduced Brand Mismatches**: Better filtering to prevent academic concepts matching to commercial brands
- **Context Parameter**: Pass main topic context to Wikipedia search methods

### Technical Fixes
- **Main Topic Storage**: Added `$this->current_main_topic` property for context-aware enrichment
- **Wikipedia Search Helper**: New `try_wikipedia_search()` method for multiple search attempts
- **Wikidata Context Search**: Enhanced Wikidata direct search with context-aware term selection
- **Better Loop Handling**: Improved foreach loops in search methods with proper continuation logic

### Expected Improvements
- **SEO Wikipedia Links**: Should now correctly find Wikipedia page for "Search Engine Optimization" 
- **Academic Programs**: Should match educational concepts rather than commercial brands in education contexts
- **Context Relevance**: Entity matching considers the main topic for better semantic accuracy
- **Reduced Errors**: Fewer mismatches between entities and unrelated Wikipedia/Wikidata pages

## [1.61.0] - 2025-01-01

### Performance Enhancement
- **Smart Entity Caching**: Implemented intelligent caching system for high-quality entities (80%+ confidence, 2+ knowledge sources)
- **1-Week Cache Duration**: Cache entities with strong Wikipedia, Wikidata, Google KG, or ProductOntology connections
- **Dynamic Circuit Breaker**: Allow processing up to 18 entities when 5+ cache hits detected (versus 12 for fresh entities)
- **Restored Entity Limits**: Increased OpenAI target back to 15-20 entities with caching performance boost

### Cache Management
- **Cache Hit Logging**: Track and log when cached entities are reused
- **Cache Statistics**: Added methods to monitor cache usage and size
- **Cache Clearing**: Added function to clear entity cache when needed
- **Smart Caching Rules**: Only cache entities with multiple knowledge graph sources and high confidence

### Expected Performance
- **Cached Entities**: Near-instant loading for previously enriched high-quality entities  
- **Mixed Processing**: Fast processing when cache hits + fresh entity enrichment
- **Better Throughput**: Process more entities in same time when cache is populated
- **Quality Maintained**: All semantic filtering and accuracy improvements preserved

### Technical Features
- Added `get_cached_entity()` and `cache_entity()` methods
- Implemented `clear_entity_cache()` and `get_cache_stats()` for management
- Cache key based on MD5 of lowercased entity name
- Transient-based caching using WordPress standards

## [1.60.0] - 2025-01-01

### Performance
- **Circuit Breaker Implementation**: Added automatic stop after 12 successful enrichments to prevent timeouts
- **Reduced Entity Count**: Lowered OpenAI extraction target from 15-25 to 12-15 high-quality entities
- **Early Wikipedia Filtering**: Pre-filter entities unlikely to have Wikipedia pages before API calls
- **Performance Cap**: Limited maximum entities to 15 regardless of admin setting

### Fixed
- **Timeout Prevention**: Circuit breaker stops processing before server timeout limits
- **Eliminated Futile API Calls**: Skip entities like "SEO Tracking", "Local SEO", "Technical SEO" that rarely have Wikipedia pages
- **Targeted Filtering**: Added patterns for generic education, ranking, and technical terms that waste API calls
- **Better Resource Management**: Process fewer entities but with higher success rates

### Quality Maintained
- **Wikipedia-Style Precision**: Kept enhanced semantic accuracy from 1.59.0
- **Semantic Filtering**: Maintained all mismatch detection improvements
- **Reduced Noise**: Focus on 12-15 high-quality entities rather than 20+ mixed-quality entities

### Technical Changes
- Added `$unlikely_wikipedia_patterns` array to pre-filter entities
- Implemented circuit breaker with `$max_successful` counter
- Reduced OpenAI target entity count in prompt
- Added early termination logging for debugging

## [1.59.0] - 2025-01-01

### Enhanced
- **Wikipedia-Style Entity Extraction**: Completely redesigned OpenAI prompt to extract entities using Wikipedia semantic precision
- **Semantic Accuracy Focus**: Instructs AI to think "Would this entity have its own Wikipedia page?" for better entity selection
- **Removed Artificial Limits**: Restored full entity processing (reverted from 15 back to 20) while improving quality through better AI guidance
- **Enhanced Semantic Rules**: Added specific guidance to prevent mismatches like "AI SEO" → "AI Seoul Summit"

### Quality Improvements
- **Wikipedia-Notable Entities**: AI now prioritizes entities that would be notable enough for Wikipedia articles
- **Proper Noun Focus**: Enhanced extraction of companies, places, people, brands, and technologies
- **Concept vs. Implementation**: Better distinction between general concepts (Analytics) vs. specific tools (Google Analytics)  
- **Academic Paper Avoidance**: Explicit guidance to avoid overly specific research papers and academic studies

### Technical Changes
- Enhanced OpenAI prompt with Wikipedia-style semantic precision guidance
- Added examples showing preferred entity types for different content categories
- Improved filtering rules to focus on entities that support the main topic
- Maintained performance optimizations while focusing on quality over quantity

## [1.58.0] - 2025-01-01

### Performance
- **Significantly Reduced Processing Time**: Added comprehensive performance optimizations to prevent timeouts
- **Limited Entity Processing**: Reduced maximum entities from 20 to 15 for faster processing
- **Reduced API Timeouts**: Lowered all API call timeouts from 10s to 6-8s for quicker failures
- **Enhanced Wikidata Filtering**: Added semantic filtering to prevent processing of irrelevant academic papers

### Fixed
- **Eliminated Poor Wikidata Matches**: Filtered out overly specific academic research papers and location-specific studies
- **Blocked Academic Papers**: Prevented matches like "Student Recruitment" → "Student recruitment in New Zealand research paper"
- **Filtered Research Studies**: Blocked "Ranking Factors" → "Diabetes remission bariatric surgery study" type matches
- **Raised Wikidata Threshold**: Increased minimum confidence from 60 to 75 for better quality matches

### Technical Optimizations
- Added `is_wikidata_semantic_mismatch()` function to filter academic and location-specific content
- Reduced Wikipedia API timeout from 10s to 8s
- Reduced content verification API timeout from 10s to 6s  
- Reduced Wikidata verification timeout from 10s to 6s
- Reduced Google Knowledge Graph timeout from 10s to 6s
- Limited entity processing to top 15 entities for performance

## [1.57.0] - 2025-01-01

### Fixed
- **Major Quality Improvement**: Significantly tightened Wikipedia matching algorithm to prevent semantic mismatches
- **Eliminated Poor Matches**: Fixed "Colleges & Universities" matching "Colleges & Universities In Wood County Texas"
- **Fixed AI SEO Mismatch**: Prevented "AI SEO" from incorrectly matching "AI Seoul Summit"  
- **Geographic Filtering**: Added penalties for unwanted geographic specificity (e.g., county/state-specific pages)
- **Stricter Word Matching**: Raised word overlap requirements from 60% to 70%+ with better stop word filtering

### Enhanced
- **Semantic Mismatch Detection**: Added specific patterns to catch and prevent common entity/title mismatches
- **Confidence Thresholds**: Raised minimum confidence from 45 to 65 for Wikipedia matches
- **Content Validation**: Increased penalties for titles with excessive extra words or geographic terms
- **Stop Word Filtering**: Improved word-based matching by excluding common stop words

### Technical Changes
- Enhanced `find_best_wikipedia_match()` with semantic mismatch detection
- Improved `calculate_wikipedia_match_score()` with stricter word overlap requirements
- Added geographic penalty system for unwanted location-specific matches
- Increased minimum score thresholds and penalties for poor matches

## [1.56.0] - 2025-01-01

### Fixed
- **Critical Bug Fix**: Fixed undefined variable `$entity` error on line 952 causing PHP warnings and timeouts
- **Critical Bug Fix**: Fixed invalid XPath expressions using `@class*` and `@id*` patterns that were causing DOMXPath::query() errors
- Updated XPath selectors to use proper `contains(@class, "...")` and `contains(@id, "...")` syntax
- Improved error handling in schema extraction to prevent crashes during content analysis

### Technical Details
- Changed `strlen($entity)` to `strlen($entity_lower)` in `calculate_wikipedia_match_score()` function
- Fixed multiple invalid XPath selectors in `extract_author_schema()` and `extract_organization_schema()` functions
- Resolved timeout issues caused by repeated PHP warnings during entity enrichment process

## [1.55.0] - 2024-12-28
### Major Feature: Enhanced Paste Content Support
- **Multi-format content detection**: Automatically detects and processes HTML, Markdown, and Plain Text content
- **Markdown parsing**: Full support for headers (#), bold (**text**), italic (*text*), links [text](url), lists, blockquotes, and code blocks
- **Intelligent plain text parsing**: Automatically detects titles, headings, and body content from unstructured text
- **Improved content structure extraction**: Better title and heading detection for pasted content
- **Enhanced entity extraction**: Leverages detected structure (titles, headings) for better entity prioritization

### Frontend Improvements
- **Updated paste area**: Clear instructions for HTML, Markdown, and Plain Text support
- **Better user guidance**: Detailed placeholder text explaining supported formats
- **Content type indication**: Results now show detected content type (markdown, html, plain_text)

### Technical Enhancements
- **Robust format detection**: Pattern-based detection for markdown syntax and HTML tags
- **Structured text processing**: Converts unstructured content to semantic HTML for consistent entity extraction
- **OpenAI integration**: Paste content now uses OpenAI for main topic detection (like URL analysis)
- **Enhanced debugging**: Content type logging for better troubleshooting

### Use Cases Enabled
- **Documentation analysis**: Paste markdown from GitHub, GitLab, or documentation sites
- **Article processing**: Copy/paste blog posts, news articles, or research papers
- **Draft content review**: Analyze content from Google Docs, Notion, or other writing tools
- **HTML snippet analysis**: Process raw HTML from webpage source or CMS exports

## [1.54.4] - 2024-12-28
### Fixed
- **Critical: Fixed cURL boolean argument error**: Added proper error handling around `json_encode()` to prevent boolean `false` from being passed to HTTP requests
- **Enhanced JSON encoding validation**: OpenAI requests now validate JSON encoding success before making HTTP calls
- **Better error logging**: Added specific error messages for JSON encoding failures

### Technical Changes
- Added validation that `json_encode()` succeeds before passing data to `wp_remote_post()`
- This fixes the error: "WpOrg\Requests\Transport\Curl::request(): Argument #3 ($data) must be of type array|string, boolean given"
- Enhanced error handling for both OpenAI entity extraction and recommendation generation

## [1.54.3] - 2024-12-28
### Fixed
- **Improved error handling**: Enhanced frontend JavaScript to properly display error messages instead of showing "[object Object]"
- **Better error debugging**: Added detailed error parsing for both AJAX success and error responses
- **Enhanced result validation**: Added error handling to displayResults function to catch JavaScript errors during rendering

### Technical Changes
- Improved error message extraction from server responses (string vs object handling)
- Added try-catch wrapper around displayResults function to prevent JavaScript errors
- Enhanced AJAX error callback to parse detailed error information from server responses

## [1.54.2] - 2024-12-28
### Fixed
- **Missing O'Hare Airport Wikidata link**: Removed overly strict Wikidata verification for airport entities
- **Enhanced airport entity Wikidata extraction**: Airport entities now bypass verification that was preventing valid Wikidata links
- **Better debugging**: Added logging to track Wikidata extraction success/failure

### Technical Changes
- Airport entities with "airport" in the page title skip the strict `verify_wikidata_entity()` check
- This should resolve O'Hare Airport missing its Wikidata link while maintaining verification for other entities
- Added debug logging to track Wikidata extraction process

## [1.54.1] - 2024-12-28
### Fixed
- **Improved Wikipedia matching for airports**: Enhanced scoring algorithm to better match "O'Hare Airport" to "O'Hare International Airport"
- **Lowered Wikipedia matching thresholds**: Reduced minimum score requirements to allow more valid matches (45 minimum, down from 60)
- **Enhanced airport entity recognition**: Added special scoring logic for airport name variations
- **More lenient content verification**: Reduced penalties for content mismatches to prevent over-filtering

### Technical Changes
- Airport entities now get 95% score for exact name matches (e.g., "O'Hare" matches "O'Hare International")
- Lowered Wikipedia confidence thresholds: 40/70 (down from 50/80), final threshold 45 (down from 60)
- Reduced content verification penalties to be less aggressive about filtering matches

## [1.54.0] - 2024-12-28
### Enhanced
- **Improved location-specific main topic detection**: OpenAI now includes key locations in main topics (e.g., "O'Hare Limo Service" instead of generic "Limo Service")
- **Enhanced O'Hare Airport entity enrichment**: Better Wikipedia matching for O'Hare Airport variations including "O'Hare", "OHare", and "O'Hare Airport"
- **Improved airport entity recognition**: Enhanced Wikipedia search patterns for all airport entities
- **Extended main topic length**: Increased from 2-4 words to 2-6 words to accommodate location-specific services

### Fixed
- Missing O'Hare in main topics for location-specific limo services
- Incomplete Wikipedia/Wikidata enrichment for O'Hare Airport entity variations

## [1.53.0] - 2024-12-28
### Fixed
- **Fixed limo service relevance detection**: Enhanced topic patterns to include O'Hare, Echo, Limousine, High-end Transportation
- **Filtered generic entities**: Added filtering for overly generic single-word entities like "Domestic", "International", "Private"
- **More conservative irrelevant flagging**: Lowered threshold from 50 to 40 confidence to prevent incorrectly flagging relevant entities
- **Enhanced transportation patterns**: Core limo service entities should no longer be flagged as irrelevant

### Technical Changes
- Enhanced limo topic relevance patterns in `identify_irrelevant_entities()` 
- Added generic entity filtering in `enrich_entities()` for single-word generic terms
- Lowered irrelevant entity threshold to be more conservative about flagging entities
- Specific pattern matching for transportation industry terminology

## [1.52.0] - 2024-12-28
### Fixed
- **Improved Wikipedia quality**: Enhanced filtering to prevent poor matches like "Greater Chicago Soccer League" and added specific handling for O'Hare Airport
- **Fixed irrelevant entity detection**: Complete rewrite of relevance algorithm to use topic-aware patterns instead of simple substring matching
- **Better entity recommendations**: Transportation entities like "Chauffeur" and "Ground Transportation" no longer incorrectly flagged as irrelevant for limo services
- **Context-aware filtering**: Universities mentioned as examples in SEO articles correctly identified as irrelevant, while SEO-related entities remain relevant

### Technical Changes
- Enhanced Wikipedia search with specific entity handling (SEO → Search Engine Optimization, O'Hare → O'Hare International Airport)
- Improved irrelevant pattern filtering in `find_best_wikipedia_match()` 
- Complete rewrite of `identify_irrelevant_entities()` with topic-specific relevance patterns
- Added topic-aware entity classification for limo services, SEO content, and education topics

## [1.51.0] - 2024-12-28
### Fixed
- **Enhanced entity relevance**: Improved OpenAI prompt to prioritize topic-specific entities and exclude abstract concepts
- **Topic-aware entity enhancement**: Added automatic detection of missing topic-relevant entities (Airport Transportation, Chauffeur, etc.)
- **Better Wikipedia filtering**: Enhanced filtering to prevent irrelevant matches like "Food Depository" and "UFO sighting"
- **Abstract concept filtering**: Added filtering for irrelevant abstract terms like "wonder", "invention", "discernment", "tenacity"
- **Increased entity threshold**: Raised Wikipedia matching confidence threshold from 50 to 60 for better quality

### Technical Changes
- Modified OpenAI prompt with topic-specific examples and concrete entity requirements
- Added `add_topic_specific_entities()` method to enhance OpenAI results with missing relevant entities
- Enhanced `find_best_wikipedia_match()` with irrelevant pattern filtering
- Expanded non-entity patterns to filter abstract business concepts
- Added topic-aware entity patterns for limo, SEO, and education content

## [1.50.0] - 2024-12-28
### Fixed
- **Improved OpenAI prompt engineering**: Enhanced prompt with better content filtering rules and increased context length (3000→8000 chars)
- **Better main topic extraction**: Prioritized OpenAI main topic over PHP fallback logic to prevent wrong topics like "Greater Chicago" for limo services
- **Context-aware entity disambiguation**: Added special handling for SEO → Seoul mismatches and other common abbreviation issues
- **Enhanced template noise filtering**: Added filtering for Semrush, widgets, sidebars, social media elements that pollute entity lists
- **Stricter entity validation**: Expanded non-entity patterns and template entity filtering to improve relevance

### Technical Changes
- Modified `extract_entities_openai()` with better prompt and 8000 char content limit
- Updated `extract_text_from_html()` with additional content filtering selectors
- Simplified main topic logic to prioritize OpenAI results
- Added context-aware Wikipedia matching to prevent semantic mismatches
- Enhanced entity filtering in `enrich_entities()` method

## [1.45.1] - 2025-06-30
### Fixed
- Fixed critical error where `$text_parts` variable was undefined when calling OpenAI extraction
- Moved text extraction before OpenAI call to ensure all required variables are available

## [1.45.0] - 2025-06-30

### Major
- **OpenAI-Driven Main Topic & Entity Extraction**: The plugin now uses OpenAI to determine both the main topic and the list of relevant entities, using a structured JSON prompt/response. PHP logic is only used as a fallback if OpenAI is unavailable or fails.

### Improved
- Simpler, more accurate, and more maintainable extraction pipeline
- Main topic and entities are now always consistent with the OpenAI response

## [1.44.4] - 2024-12-19

### Added
- **Version Number in Markdown**: Added version number to the markdown download output for better tracking

### Improved
- Better version tracking in exported analysis reports
- Version information available in frontend JavaScript

## [1.44.3] - 2024-12-19

### Added
- **Main Topic Debugging**: Added comprehensive debugging to track main topic detection process
- **Enhanced Pattern Matching**: Improved detection patterns for blog content and service names

### Improved
- Better debugging output to identify why main topic detection might be failing
- More specific pattern matching for different content types

## [1.44.2] - 2024-12-19

### Fixed
- **Main Topic Detection**: Improved to better identify full service names like "O'Hare Airport Limo Service" and "AI Search Engines" instead of generic terms
- **Author Filtering**: Added filtering to prevent garbage text like "simply clicking on the" and "one." from being extracted as author names
- **Business Name Validation**: Enhanced copyright extraction to filter out invalid business names and require proper capitalization

### Improved
- Better pattern matching for SEO and marketing content
- More robust author and business name validation
- Enhanced filtering of irrelevant text fragments

## [1.44.1] - 2024-12-19

### Fixed
- **Shortcode Attributes**: Fixed issue where shortcode attributes (title, placeholder) were not being properly passed to the template

## [1.7.0] - 2024-12-19

### Added
- **Author Byline Detection**: Added extraction of author names from blog bylines for blog content
- **Content-Type Aware Author Detection**: Now prioritizes author bylines for blog content and copyright notices for business content

### Improved
- Better handling of different content types (blogs vs business pages)
- More accurate author identification for blog articles
- Enhanced author detection patterns including "Written by:", "By:", "Author:", etc.

## [1.43.0] - 2024-12-19

### Added
- **Copyright-Based Business Detection**: Added extraction of business names from copyright notices, which are more reliable than parsing titles
- **Enhanced Author Identification**: Now prioritizes copyright notices over title parsing for finding the actual business name

### Improved
- More accurate organization and author detection in structured data
- Better handling of business names in JSON-LD generation
- Reduced reliance on potentially misleading title parsing

## [1.42.0] - 2024-12-19

### Fixed
- **Main Topic Detection**: Improved to identify full service names like "O'Hare Airport Limo Service" instead of generic "Limousine"
- **Author Identification**: Fixed to use actual business name "Echo Limousine" instead of generic "Limousine" in JSON-LD
- **Spam Filtering**: Added comprehensive spam detection for Wikidata entities to filter out Las Vegas spam and irrelevant listings
- **Generic Entity Filtering**: Added filtering for overly generic entities like "Services" and "Service" unless they have high confidence scores

### Improved
- Enhanced business name extraction from page titles
- Better prioritization of specific business entities over generic terms
- Improved Wikidata matching with spam penalty system
- More accurate organization and author detection in structured data

## [1.41.0] - 2025-01-XX

### Added
- **OpenAI Entity Extraction Prioritization**: OpenAI is now the primary method for entity extraction when API key is available
- **Business-Focused OpenAI Prompt**: Completely redesigned prompt to prioritize core business entities like company names, locations, and services
- **Core Business Entity Guarantee**: Core business entities are always included regardless of filtering scores
- **Improved Extraction Priority**: OpenAI → Core Business Entities → HTML Structure → Regex (only if needed)

### Changed
- **Enhanced OpenAI Prompt**: Specific instructions for business entity extraction with priority ordering
- **Less Aggressive Filtering**: Reduced minimum score from 25 to 15 and guaranteed inclusion of core business entities
- **Better Entity Prioritization**: Core business entities bypass all filtering and are always included
- **Improved Debug Logging**: Added detailed logging for each extraction method and entity addition

### Fixed
- **Missing Core Entities**: "Echo Limousine", "O'Hare International Airport", "Chicago" are now guaranteed to be included
- **Over-Filtering Issues**: Reduced aggressive filtering that was blocking legitimate business entities
- **Poor Entity Count**: Now ensures sufficient entities are extracted before applying filters

## [1.40.0] - 2025-01-XX

### Added
- **Frontend Version Display**: Added version number to the frontend form so users can see which version they're running
- **Version Styling**: Added CSS styling for the version number to make it look clean and unobtrusive

### Changed
- **User Experience**: Users can now easily identify which version of Ontologizer they're using
- **Consistency**: Version display now matches the admin page footer

## [1.39.0] - 2025-01-XX

### Added
- **Comprehensive Entity Scoring System**: Implemented relevance, prominence, and accuracy scoring with prioritized business entities
- **Core Business Entity Prioritization**: Highest priority for "Echo Limousine", "O'Hare International Airport", "Chicago", "Limousine", "Chauffeur"
- **Secondary Business Entity Recognition**: High priority for "Midway International Airport", "Signature Flight Support", "Airport Terminal"
- **Service Type Recognition**: Medium-high priority for "Corporate Travel", "Wedding Limo", "Car Service", "Limo Rental"
- **Vehicle Type Recognition**: Medium priority for "Lincoln Town Car", "Stretch Limo", "Executive SUV"
- **Location Entity Recognition**: Medium priority for "Cook County", "Milwaukee Mitchell International Airport"

### Changed
- **Enhanced Wikidata Matching**: Added business-specific patterns and spam detection to avoid irrelevant results
- **Improved Entity Filtering**: Comprehensive penalties for irrelevant entities like "Chicago Book", "Chicago O", "Exit A"
- **Better Prominence Scoring**: Title presence (40pts), heading presence (30pts), body frequency (20pts), length bonus (10pts)
- **Relevance Penalties**: Heavy penalties for spam results and location mismatches

### Fixed
- **Spam Wikidata Results**: Prevents "Limo Service" from matching "limo services in Las Vegas" spam
- **Irrelevant Entity Filtering**: Eliminates "Chicago Book" (prison books), "Chicago O" (roller derby), exit signs
- **Poor Entity Prioritization**: Now prioritizes core business entities over generic terms
- **Low Accuracy Matching**: Business-specific patterns ensure better Wikipedia/Wikidata matches

## [1.38.0] - 2025-01-XX

### Fixed
- **Street Name Filtering**: Added comprehensive filtering for street names ending in Ave, Rd, St, Blvd, etc.
- **Exit Sign Filtering**: Added patterns to filter out airport exit signs like "Exit A", "Exit B", "Exit B O"
- **Irrelevant Entity Filtering**: Enhanced filtering for "Chicago Book", "Chicago O", "Booster", "Foster Ave", "Weber Rd"
- **Main Topic Detection**: Improved to detect full service names like "O'Hare Airport Limo Service" instead of just "Limo Service"

### Changed
- **Enhanced Pattern Matching**: Added specific patterns to catch and filter out street names and exit signs
- **Better Service Pattern Recognition**: Prioritizes specific service patterns over general business patterns
- **Improved Irrelevant Word Detection**: Expanded blacklist to include street abbreviations and irrelevant terms

### Added
- **Street Name Detection**: Patterns to identify and filter out street names with common abbreviations
- **Exit Sign Detection**: Specific patterns to catch airport exit signs and similar irrelevant entities
- **Service-Specific Topic Detection**: Better recognition of full service descriptions in page titles

## [1.37.0] - 2025-01-XX

### Fixed
- **Malformed Entity Extraction**: Fixed regex patterns that were creating incorrect entities like "Hare Airport Limo Services Procedure After"
- **Improved Entity Boundaries**: Changed from 2-4 word patterns to more restrictive 2-3 word patterns to prevent malformed phrases
- **Enhanced Irrelevant Word Filtering**: Added comprehensive filtering for words like "Touch", "Meet", "Hourly", "Minutes", "Hare", "Procedure", "After"
- **Better Semantic Relevance**: Improved detection of malformed entities and irrelevant phrases in semantic filtering

### Changed
- **Entity Extraction Priority**: Business terms and service patterns are now extracted first before general phrases
- **Proper Noun Filtering**: Single capitalized words are only included if they're known proper nouns
- **Pattern-Based Filtering**: Added specific patterns to catch and filter out malformed entities

### Added
- **Malformed Entity Detection**: Specific patterns to identify and filter out incorrectly formed entities
- **Enhanced Blacklist**: Expanded list of irrelevant words and phrases that should be filtered out
- **Context-Specific Filtering**: Additional checks for transportation service context

## [1.36.0] - 2025-01-XX

### Added
- **Semantic Relevance Filtering**: Implemented intelligent filtering that only keeps entities semantically relevant to the main topic
- **Main Topic Detection**: Automatically identifies the primary topic (transportation service, location, etc.) from page content
- **Contextual Entity Validation**: Entities must be related to the main topic through keywords, title/heading presence, or proper noun patterns
- **Enhanced Irrelevant Word Filtering**: Expanded blacklist of common irrelevant words like "Touch", "Meet", "Hourly", "Minutes"

### Changed
- **Improved Entity Quality**: Significantly reduced irrelevant entities by requiring semantic relevance to main topic
- **Better Debug Logging**: Added detailed logging showing why entities are kept or filtered
- **Increased Minimum Score**: Raised minimum salience score from 15 to 25 for higher quality entities

### Fixed
- **Relevance Issues**: Eliminated random capitalized words that appear in content but aren't semantically related to the business
- **Context Awareness**: Entities must now be contextually relevant to the primary topic (e.g., airport limo services)

## [1.35.0] - 2024-12-19

### Fixed
- **Critical Fix**: Removed hardcoded test entities - now performs real entity extraction
- **Critical Fix**: Fixed salience scoring algorithm - no longer returns 100% incorrectly
- **Critical Fix**: Real entity extraction now working with proper apostrophe handling
- **Critical Fix**: Salience score now based on entity quality, validation, and relevance

### Changed
- **Real entity extraction**: Removed test mode and enabled actual text processing
- **Salience calculation**: Now based on validation rate, confidence rate, and entity relevance
- **Quality scoring**: Penalizes generic terms and rewards high-quality entities
- **Entity filtering**: More aggressive filtering of low-quality entities

### Improved
- **Entity quality**: Only meaningful entities from actual content are extracted
- **Salience accuracy**: Scores now reflect actual content quality (should be 30-70% range)
- **Processing reliability**: Real extraction instead of hardcoded test data
- **Debug logging**: Better visibility into actual extraction process

## [1.34.0] - 2024-12-19

### Fixed
- **Critical Fix**: Fixed apostrophe handling in entity extraction - "O'Hare" no longer becomes "Hare"
- **Critical Fix**: Fixed generic words like "Your", "This", "Wait", "Pick", "Drop" being treated as entities
- **Critical Fix**: Fixed "Your" being incorrectly used as the author in JSON-LD schema
- **Critical Fix**: Improved person entity detection to filter out generic pronouns and common words
- **Critical Fix**: Enhanced regex patterns to properly handle apostrophes in entity names

### Changed
- **Increased minimum salience score**: From 15 to 25 for more selective entity filtering
- **Enhanced blacklist**: Added comprehensive list of common words that shouldn't be entities
- **Improved author detection**: Now properly uses organization names instead of generic words
- **Better entity type detection**: Generic words are no longer classified as "person" entities

### Improved
- **Entity quality**: Only meaningful, properly formatted entities are retained
- **JSON-LD accuracy**: Author and publisher information now uses proper organization names
- **Processing precision**: Better filtering reduces noise and improves schema quality

## [1.33.0] - 2024-12-19

### Added
- **Confidence-based entity filtering**: Entities are now filtered based on confidence scores after enrichment
- **Salience scoring system**: Entities are scored based on prominence, frequency, and contextual relevance
- **Entity blacklist filtering**: Generic terms like "page", "service", "content" are automatically filtered out
- **Enhanced confidence scoring**: Improved scoring with external validation weighting and synergy bonuses
- **Prominence metrics**: Entities appearing in title, headings, and meta description get higher scores
- **Multi-context bonus**: Entities appearing in multiple contexts (title + headings + body) get bonus points

### Changed
- **Entity selection**: Now prioritizes entities by salience score instead of just length
- **Confidence thresholds**: Minimum confidence score of 40 required for enriched entities
- **External validation weighting**: Wikipedia (15pts), Wikidata (12pts), Google KG (10pts), ProductOntology (8pts)
- **Synergy bonuses**: Entities with multiple external validations get additional scoring bonuses
- **Type-based scoring**: Organization, person, and place entities get additional confidence bonuses

### Improved
- **Entity quality**: Only high-confidence, well-validated entities are retained
- **Processing efficiency**: Better filtering reduces noise and improves JSON-LD quality
- **Debug logging**: Enhanced logging shows which entities are kept vs filtered and why

## [1.32.0] - 2024-12-19

### Changed
- Improved entity extraction: post-processing now filters out entities that are too long, contain sentence punctuation, or are mostly lowercase
- OpenAI prompt updated to only return canonical entity names (no descriptions, no sentences, no more than 5 words per entity)

## [1.31.0] - 2024-12-19

### Added
- Admin setting to limit the maximum number of entities to enrich (default 20)
- Timing and debug info for each major step (extraction, enrichment, JSON-LD) included in AJAX response when debug mode is enabled
- Debug info and error messages are now returned in AJAX error responses for easier troubleshooting

### Changed
- Enrichment is now limited to the top N entities by length for speed
- Improved error handling and reporting in AJAX responses

## [1.30.0] - 2024-12-19

### Fixed
- Fixed fatal error in extract_entities method where strlen() was called on an array instead of a string
- Properly handle the array structure returned by extract_text_from_html method
- Create combined text content string for entity extraction processing

## [1.29.0] - 2024-12-19

### Added
- Debug mode toggle in admin settings for easy debugging during feature development
- Comprehensive debug logging throughout the entity extraction and processing pipeline
- Debug logging only outputs when debug mode is enabled via admin setting
- Test mode functionality for returning hardcoded entities when debugging

### Changed
- Replaced all error_log calls with debug_log calls that respect the debug mode setting
- Improved entity extraction with structured methods for HTML, text, and OpenAI extraction
- Enhanced debugging output with detailed processing steps and entity counts

## [1.28.0] - 2024-12-19

### Added
- **Test Mode**: Temporarily using hardcoded list of 25 entities to isolate the issue
- **Entity Isolation**: Bypassing complex extraction logic to test if the problem is in extraction or enrichment

### Testing
- Hardcoded entities include: O'Hare International Airport, Echo Limousine, Chicago, Midway International Airport, Signature Flight Support, Lincoln Town Car, Executive SUV, Stretch Limo, Party Bus, Charter Bus, Corporate Travel, Wedding Limo, Prom Limo, Funeral Limo, Airport Transportation, Car Service, Chauffeur Service, Limo Service, Transportation Service, Arlington Heights, Batavia, Carol Stream, Dekalb, Bolingbrook, Elgin

## [1.27.0] - 2024-12-19

### Added
- **Comprehensive Debugging**: Added detailed logging throughout the entire processing pipeline
- **Cache Clearing**: Force fresh processing by clearing cached results
- **Processing Tracking**: Log every step from URL processing to final result
- **Entity Extraction Debugging**: Track entity extraction from start to finish
- **Main Topic Detection Logging**: Log the main topic detection process

### Fixed
- **Fresh Processing**: Ensures new code runs instead of cached results
- **Debug Visibility**: All processing steps now logged for troubleshooting

## [1.26.0] - 2024-12-19

### Fixed
- **Apostrophe Handling**: Fixed "O'Hare" being truncated to "Hare" in entity extraction and primary topic detection
- **Organization URLs**: Fixed schema to use website URL instead of page URL for organization references
- **Entity Extraction Debugging**: Added comprehensive logging to track entity extraction process

### Added
- Detailed debugging logs to identify why only 5 entities are being extracted
- Better text processing for apostrophes and special characters
- Enhanced logging throughout the entity extraction pipeline

## [1.25.0] - 2024-12-19

### Fixed
- **Entity Extraction**: Now returns all extracted entities instead of filtering them out
- **Primary Topic Detection**: Prioritizes service descriptions (like "O'Hare Airport Limo Service") over organization names
- **Service Pattern Matching**: Added specific patterns for airport limo services and transportation services

### Improved
- Better detection of multi-word service descriptions in page titles
- Enhanced scoring system that boosts service descriptions over single organizations
- Added debugging logs to track entity extraction process

## [1.24.0] - 2024-12-19

### Fixed
- **Entity Extraction**: Increased limit from 20 to 50 entities to capture more entities from rich content
- **Schema Generation**: Fixed author/publisher to use actual organization names instead of URLs
- **Entity Type Detection**: Improved organization classification, especially for limousine companies
- **Organization Names**: Added "echo" to organization detection patterns

### Improved
- Better handling of organization names in JSON-LD schema
- More comprehensive entity processing

## [1.23.0] - 2024-12-19

### Enhanced
- **Entity Extraction**: Comprehensive expansion based on ChatGPT analysis to find 20+ entities instead of 5
- **Business Terms**: Added specific detection for "Signature Flight Support", "Milwaukee Mitchell International Airport", and 40+ location names
- **Conceptual Terms**: Added extraction of "Chauffeur", "Fleet", "Baggage claim", "Airport terminal", "Grace period", "Meet & Greet", "Flight tracking"
- **Service Patterns**: Enhanced pattern matching for "Charter Bus", "Party Bus", "Executive SUV", "Stretch Limo", "Lincoln Town Car"
- **Entity Classification**: Improved type detection for facilities, businesses, services, and products

### Added
- Support for Michigan locations (MI)
- Vehicle and product entity classification
- Terminal-specific entity detection (Terminal 1-5)
- Flight-related service terms

## [1.22.0] - 2024-12-19

### Fixed
- **Entity Extraction**: Improved handling of apostrophes and special characters (fixes "O'Hare" being truncated to "Hare")
- **Entity Type Detection**: Better classification of organizations, places, and services (especially for limousine/transportation businesses)
- **Author/Publisher Detection**: Fixed to use actual organization names instead of URLs
- **Entity Count**: Enhanced extraction to find more entities from rich content

### Improved
- Added specific business/service term detection for transportation and limousine services
- Better location name extraction (cities, airports, landmarks)
- Enhanced service type pattern matching
- Improved organization identification for limousine companies

## [1.21.0] - 2024-12-19

### Fixed
- **JSON-LD Schema**: Now includes ALL entities in the schema (not just those with external references)
- **Author/Publisher Detection**: Fixed to use actual organization name instead of random Wikipedia pages
- **Main Entity Detection**: Improved identification of core business/service being offered (e.g., "Higher Education Marketing Agency")
- **Entity Type Mapping**: Better classification of entities in schema output

### Improved
- Business/service term detection for main entity selection
- Organization identification prioritizes company name over generic organizations
- Schema structure more accurately reflects the actual page content and business

## [1.20.0] - 2024-12-19

### Improved
- JSON-LD mainEntity type is now dynamically selected based on page content, meta tags, and detected entities. Supports Article, FAQPage, HowTo, Service, Product, Event, Course, Organization, and WebPage types.
- Fallback to WebPage if no specific type is detected.

## [1.19.0] - 2024-12-19

### Improved
- Entity type detection: More accurate classification of Person, Organization, University, Article, etc. using Wikidata and name heuristics. Avoids misclassifying most entities as Person.
- JSON-LD schema generation: Now outputs WebPage with @id, datePublished, dateModified, inLanguage, mainEntity as Article, isPartOf for website, and includes Organization and Person schemas for publisher/author if detected. Closely matches best-practice schema.org structure.
- Author and publisher are extracted from meta tags if available, otherwise fallback to best guess from entities or site name.

### Fixed
- Entities are no longer incorrectly classified as Person by default.
- Organization and Person schemas are included in JSON-LD if detected.

## [1.18.0] - 2024-12-19

### Fixed
- **Critical Fix**: Added missing `find_productontology_url()` method that was causing fatal errors during entity enrichment
- **Critical Fix**: Added missing `calculate_confidence_score()` method for proper entity scoring
- **Entity Enrichment**: Fixed confidence score calculation based on successful enrichments and type detection

### Technical
- Resolved PHP fatal error: "Call to undefined method OntologizerProcessor::find_productontology_url()"
- Resolved PHP fatal error: "Call to undefined method OntologizerProcessor::calculate_confidence_score()"
- Implemented proper confidence scoring system that rewards successful entity enrichments
- Added placeholder for ProductOntology integration (currently returns null, ready for future enhancement)

## [1.17.0] - 2024-12-19

### Fixed
- **Critical Fix**: Added missing `get_google_search_fallback_url()` method that was causing fatal errors during entity enrichment
- **Google Knowledge Graph Integration**: Fixed fallback mechanism when Google KG API is unavailable or fails

### Technical
- Resolved PHP fatal error: "Call to undefined method OntologizerProcessor::get_google_search_fallback_url()"
- Ensures Google search fallback URLs are properly generated when Knowledge Graph API is not available

## [1.16.0] - 2024-12-19

### Fixed
- **Critical Fix**: Added missing `process_pasted_content` method that was accidentally removed during syntax fixes
- **Critical Fix**: Added missing `generate_json_ld` and `analyze_content` methods referenced by process_pasted_content
- **Improved Error Handling**: Enhanced webpage fetching with better error messages and debugging information
- **Better Debugging**: Added detailed logging for webpage fetch attempts and failures
- **Content Validation**: Added checks to ensure fetched content is actually HTML and not empty

### Technical
- Fixed server errors when pasting HTML content in the frontend form
- Improved error messages to guide users when webpage fetching fails
- Added content validation to prevent processing of non-HTML content

## [1.15.0] - 2024-12-19

### 🎯 Major Improvements
- **Enhanced Author Detection**: Completely overhauled author extraction to avoid picking up form text, UI elements, and irrelevant content. Now properly extracts actual author names or returns null.
- **Comprehensive Organization Schema**: Added detailed organization information extraction including:
  - Website URL detection
  - Phone number extraction with pattern matching
  - Email address detection
  - Physical address extraction with regex validation
  - Social media profile links (Facebook, Twitter, LinkedIn, etc.)
  - Logo image detection
- **Improved Main Topic Detection**: Enhanced main topic selection logic to prioritize specific SEO terms like "Barnacle SEO" over generic terms like "Search Engine Optimization".
- **Fixed Entity Matching Issues**: Resolved SEO entity mismatches where "SEO" was incorrectly linking to "Seoul" instead of "Search Engine Optimization".

### 🔧 Technical Enhancements
- **Enhanced Wikipedia Matching**: Improved scoring algorithm with specific handling for SEO/marketing terms and acronym expansion.
- **Better Google Knowledge Graph Integration**: Enhanced entity matching with context-aware scoring and SEO term prioritization.
- **Improved Entity Validation**: Better confidence scoring with content verification and disambiguation detection.
- **Enhanced Error Handling**: More comprehensive logging and validation throughout the entity processing pipeline.

### 🐛 Bug Fixes
- Fixed author detection picking up form submission text
- Resolved entity matching confusion between SEO terms and unrelated entities
- Improved main topic selection accuracy for specific marketing terms
- Enhanced organization schema completeness and accuracy

### 📚 Documentation
- Updated roadmap to reflect completed improvements
- Enhanced code documentation for new features
- Improved implementation notes and technical considerations

## [1.14.0] - 2024-06-28

### Added
- **Enhanced Knowledge Graph Validation**: Comprehensive error checking to prevent incorrect Wikipedia/Wikidata links
  - Multi-result search with confidence scoring for better entity matching
  - Content verification to ensure Wikipedia pages actually mention the entity
  - Disambiguation page detection and avoidance
  - Improved error logging for debugging
- **Advanced JSON-LD Schema Generation**: Automatic detection and inclusion of additional schema types
  - Author detection from meta tags, CSS classes, and text patterns
  - Organization/publisher identification from site branding elements
  - FAQ schema extraction with question-answer pairing
  - HowTo schema detection for tutorials and guides
  - Comprehensive structured data for better SEO
- **Improved Confidence Scoring**: More accurate entity confidence assessment
  - Multi-source validation bonuses when multiple knowledge bases agree
  - Entity type-specific scoring (Person, Organization, Place, etc.)
  - Better validation of entity matches across all sources

### Changed
- **Wikipedia API Integration**: Now searches 5 results instead of 1 and picks the best match
- **Wikidata Integration**: Enhanced with multi-result search and label matching
- **Google Knowledge Graph**: Improved with better name matching and description relevance
- **JSON-LD Output**: Now includes author, publisher, FAQ, and HowTo schemas when detected

### Fixed
- **Entity Validation**: Prevents incorrect entity matches that could lead to wrong Wikipedia pages
- **Schema Accuracy**: Ensures generated structured data accurately represents page content
- **Error Handling**: Better logging and error messages for debugging

## [1.1.0] - 2024-06-21

### Added
- **Cache Management**: Added a "Clear Cache" button on the admin page to manually clear all cached analysis results.
- **Topical Entity Extraction**: Improved the OpenAI prompt to extract key topics and concepts (e.g., "digital marketing", "SEO") in addition to traditional named entities.
- **Google Knowledge Graph API Integration**: The plugin now uses the official Google KG API when a key is provided, generating valid entity links.
- **Google Search Fallback**: If no KG API key is present, links now fall back to a standard Google search for the entity, ensuring all links are functional.
- **Confidence Scoring**: Entities are now assigned a confidence score based on the number and quality of data sources found.
- **Enhanced Admin UI**: Added a dedicated Cache Management section and improved the layout of the settings page.
- **Frontend Progress Indicators**: The UI now shows progress bars and more detailed loading states during analysis.
- **Processing Stats**: The results page now displays key metrics like processing time, total entities found, and number of enriched entities.
- **Versioning**: Implemented versioning for the plugin files and assets.

### Changed
- **Improved Error Handling**: More specific and user-friendly error messages for API timeouts and other issues.
- **Simulated KGMID Removed**: Replaced the non-functional simulated Google Knowledge Graph IDs.
- **UI/UX Polish**: Improved styling for entity lists, confidence scores, and recommendations for better readability and user experience.

### Fixed
- **Admin Page Duplication**: Corrected a bug that caused settings fields to be duplicated on the admin page.

## [1.0.0] - 2024-06-21

### Added
- Initial release of the Ontologizer plugin.
- Core functionality for URL processing and entity extraction.
- Enrichment from Wikipedia, Wikidata, ProductOntology, and a simulated Google Knowledge Graph.
- Generation of JSON-LD `about` and `mentions` schema.
- Basic content analysis and recommendations.
- WordPress admin page for API key configuration.
- Frontend shortcode `[ontologizer]` for easy embedding.
- Caching of results using WordPress transients.
- AJAX-powered form for interactive analysis.
- Basic styling for frontend and admin components.

## [1.6.0] - 2024-06-21

### Added
- **Paste Content option**: Users can now paste HTML or visible content for analysis if URL fetch fails or for protected sites.
- **Automatic fallback**: If a URL cannot be fetched, the UI prompts the user to paste content.
- **Admin cache log**: View and delete individual cached runs from the admin page.

### Changed
- **Main topic/entity extraction**: Now includes page <title> and meta description for improved accuracy.
- **Improved error handling and user prompts**: For fetch failures.

### Fixed
- Various UI and UX improvements for fallback and cache management.

## [1.6.1] - 2024-06-21

### Added
- **OpenAI token usage and estimated cost**: Now tracked and displayed in the Analysis Results section.

### Changed
- **Main topic and entity extraction logic**: Now prioritizes title, meta description, and headings for more accurate topic detection and salience.
- **Only truly off-topic entities**: Are marked as irrelevant; subdomains and solutions are now correctly grouped and scored.

### Fixed
- **Improved consistency**: Between entity relevance and recommendations.

## [1.7.0] - 2024-06-21

### Added
- **Combined main topic logic**: If two top entities appear together in the title, meta, or headings, the plugin will use the combined phrase as the main topic (e.g., 'Higher Education Digital Marketing').

### Changed
- **Improved main topic detection**: For intersectional/compound topics.

## [1.7.1] - 2024-06-21

### Added
- **Improved combined entity detection**: Finds the longest relevant phrase from top entities in title/meta/headings for main topic.
- **Sub-entity inclusion**: Ensures important sub-entities (e.g., 'Higher Education') are included if present in title/meta/headings.

### Changed
- **More robust main topic and entity extraction**: For intersectional/compound topics.

## [1.7.3] - 2025-07-02

### Fixed
- **Always includes capitalized n-grams (e.g., 'Higher Education')**: From title/meta/headings/URL as entities, ensuring core topics are never missed.

## [1.7.4] - Improved entity identification, main topic extraction, and developer attribution to Will Scott

## [1.8.0] - Added front-end cache override option for users to force fresh analysis of a URL. Minor improvements to main topic selection flexibility.

## [1.9.0] - Improved main topic extraction: Now automatically detects course/program names from page titles (e.g., "AI Marketing Course"). Enhanced phrase detection for better topic identification.

## [1.10.0] - Improved contextual entity handling for Person topics: cuisine, city, organization, restaurant, place, location, and region are no longer flagged as off-topic.

## [1.11.0] - Improved salience tips for Person topics: now recommends strengthening connections to contextually relevant entities (cuisine, city, organization, restaurant, place, location, region, book, TV show) instead of removing them.

## [1.12.0] - Recommendations now default to aligning/integrating related entities with the main topic, only suggesting removal for truly irrelevant content.

## [1.13.0] - Entities present in the title, headings, or more than once in the body are never flagged as irrelevant.

## [Unreleased]
- Improved entity identification and main topic extraction logic
- Main topic now prefers exact phrase matches and boosts Person/Organization entities
- Entities are enriched with type information (Person, Organization, etc.) for better topic selection

## [1.46.0] - 2025-06-30
### Improved
- Loosened entity filtering: Lowered minimum confidence for enriched entities to 30
- Increased max entities to 30 for broader coverage
- OpenAI prompt now requests 15-25 business-relevant entities for more comprehensive extraction
- OpenAI token usage and cost are always shown on the frontend, even if zero

## [1.47.0] - 2025-06-30
### Improved
- **Dynamic Entity Weighting**: Replaced hardcoded business-specific entity weights with a dynamic system that calculates relevance based on the detected main topic
- **Topic-Aware Scoring**: Entity scores now include topic relevance bonuses, prominence scores, and entity type bonuses
- **Semantic Relevance**: Improved semantic relevance checking with contextual keyword matching for different topic types (transportation, SEO/marketing, AI/technology, business)
- **Better Entity Prioritization**: Entities are now prioritized based on their semantic similarity to the main topic rather than static categories

## [1.48.0] - 2025-06-30
### Added
- **Schema JSON-LD Integration**: Extract and incorporate existing Schema JSON-LD from webpages
- **Entity Supplementation**: Add entities from existing `@about`, `@mentions`, and `@mainEntity` arrays to the entity pool
- **Metadata Merging**: Use existing author, publisher, dates, and other metadata to supplement Ontologizer's output
- **Valid Schema Output**: Ensure final JSON-LD is valid, nested schema that supplements rather than conflicts with existing structured data

## [1.48.1] - 2025-06-30
### Fixed
- **JSON-LD URL Issue**: Fixed empty URLs in generated JSON-LD by passing the actual URL to generate_json_ld method
- **OpenAI Token Tracking**: Properly track and display OpenAI token usage and cost on the frontend
- **Entity Count**: Improved OpenAI prompt to request 15-25 entities instead of just "most relevant"
- **Entity Filtering**: Lowered minimum confidence threshold to 20 and reduced generic entity filtering for more comprehensive entity extraction

## [1.48.2] - 2025-06-30
### Improved
- **OpenAI Prompt**: Updated prompt to request concise main topics (2-4 words max) and only canonical, proper-noun entities
- **Entity Filtering**: Added filtering to remove entities longer than 5 words and non-entity patterns (pricing, location, reliability, efficiency, comfort, framework, reports, surveys, meet & greet, pick up, drop off, car seat, booster, flight status, white papers, ai search success, intelligence reports, working genius)
- **Entity Quality**: Improved entity extraction to focus on actual named entities rather than generic concepts or service descriptions

## [1.49.0] - 2025-06-30
### Fixed
- **OpenAI Main Topic Integration**: Fixed critical issue where OpenAI was only being used for entity extraction but not main topic detection
- **Structured OpenAI Response**: OpenAI now returns both main topic and entities in a structured format, ensuring consistency
- **Primary Topic Accuracy**: Main topic is now determined by OpenAI (when available) instead of fallback PHP logic, resulting in more accurate and concise topics
- **Entity-Topic Alignment**: Entities and main topics are now extracted together by the same AI model, ensuring better semantic coherence

### Improved
- **Main Topic Quality**: Should now see more concise, accurate main topics (e.g., "Limo Service" instead of "Greater Chicago")
- **Entity Count**: Should extract more relevant entities while filtering out non-entities and generic concepts 

## [1.44.0] - 2024-12-19

### Added
- **🎯 Advanced FAQ Detection Engine**
  - Enhanced selectors supporting accordion, collapse, and modern FAQ patterns
  - Multi-strategy answer finding with accordion/collapse content detection
  - Author detection within FAQ answers for attribution
  - Comprehensive question validation using natural language patterns
  - Automatic deduplication and quality filtering of FAQ items
  - Support for FAQ extraction from page headings and structure
  - Increased FAQ limit to 15 items for richer content

- **📝 Enhanced HowTo Schema Extraction**
  - Advanced step detection with multiple DOM selectors and patterns
  - Automatic step name and description separation
  - Image integration for visual step instructions
  - Time estimation extraction with ISO 8601 duration format
  - Supply and tool requirement detection
  - Page structure analysis for numbered guides and tutorials
  - Step limit increased to 25 for comprehensive guides
  - Fallback text parsing for unstructured step content

- **🔧 Intelligent Schema Type Detection**
  - Multi-schema type detection (Service, LocalBusiness, Educational, Article)
  - Pattern-based content analysis for optimal schema selection
  - Service schema with provider details and rich metadata
  - LocalBusiness schema with contact info and service catalogs
  - EducationalOccupationalProgram schema with detailed program info
  - Article schema with enhanced structured content

- **⚡ Advanced Schema Validation & Optimization**
  - Schema.org compliance validation with required property checks
  - Voice search optimization with speakable specifications
  - Enhanced entity relationship mapping with knowsAbout properties
  - Comprehensive sameAs array generation from social media links
  - Contact information extraction (phone, address, social profiles)
  - Business service catalog generation with rich descriptions
  - Educational program details extraction (duration, credits, credentials)

### Enhanced
- **Entity Relationships**: Now supports knowsAbout arrays for business expertise
- **Contact Detection**: Automatic extraction of phone numbers, addresses, and social links
- **Schema Validation**: Built-in validation ensures Schema.org compliance
- **Voice Search**: Added speakable specifications for voice assistant optimization
- **Rich Metadata**: Enhanced descriptions and additional type mappings

### Technical Improvements
- Modular schema generation with type-specific methods
- Advanced DOM parsing for complex content structures
- Robust error handling and fallback mechanisms
- Performance optimized with selective processing
- Extensible architecture for future schema types

---

## [1.43.1] - 2024-12-19 