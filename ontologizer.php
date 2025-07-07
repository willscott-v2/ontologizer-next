<?php
/**
 * Plugin Name: Ontologizer
 * Plugin URI: https://github.com/willscott-v2/ontologizer
 * Description: Automatically extract named entities from webpages and enrich them with structured identifiers from Wikipedia, Wikidata, Google's Knowledge Graph, and ProductOntology.
 * Version: 2.1.0
 * Author: Will Scott
 * License: MIT License
 * Text Domain: ontologizer
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('ONTOLOGIZER_VERSION', '2.1.0');
define('ONTOLOGIZER_PLUGIN_URL', plugin_dir_url(__FILE__));
define('ONTOLOGIZER_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Helper function to increment version numbers
 * Usage: ontologizer_increment_version('1.7.1', 'patch') -> '1.7.2'
 *        ontologizer_increment_version('1.7.1', 'minor') -> '1.8.0'
 *        ontologizer_increment_version('1.7.1', 'major') -> '2.0.0'
 */
function ontologizer_increment_version($current_version, $type = 'patch') {
    $parts = explode('.', $current_version);
    $major = intval($parts[0]);
    $minor = intval($parts[1]);
    $patch = intval($parts[2]);
    
    switch ($type) {
        case 'major':
            $major++;
            $minor = 0;
            $patch = 0;
            break;
        case 'minor':
            $minor++;
            $patch = 0;
            break;
        case 'patch':
        default:
            $patch++;
            break;
    }
    
    return "{$major}.{$minor}.{$patch}";
}

// Include required files
if (file_exists(ONTOLOGIZER_PLUGIN_PATH . 'includes/class-ontologizer-processor.php')) {
    require_once ONTOLOGIZER_PLUGIN_PATH . 'includes/class-ontologizer-processor.php';
} else {
    // Handle missing file gracefully
    add_action('admin_notices', function() {
        echo '<div class="notice notice-error"><p>Ontologizer Error: Required processor file is missing. Please reinstall the plugin.</p></div>';
    });
    return;
}

// Main Ontologizer class
if (!class_exists('Ontologizer')) {
class Ontologizer {
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_ontologizer_process_url', array($this, 'process_url_ajax'));
        add_action('wp_ajax_nopriv_ontologizer_process_url', array($this, 'process_url_ajax'));
        add_action('wp_ajax_ontologizer_clear_cache', array($this, 'clear_cache_ajax'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'admin_enqueue_scripts'));
        add_shortcode('ontologizer', array($this, 'shortcode'));
        add_action('wp_ajax_ontologizer_list_cache', array($this, 'list_cache_ajax'));
        add_action('wp_ajax_ontologizer_delete_cache_entry', array($this, 'delete_cache_entry_ajax'));
        
        // Activation and deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }
    
    public function init() {
        // Initialize plugin
        load_plugin_textdomain('ontologizer', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }
    
    public function activate() {
        // Set default options
        if (!get_option('ontologizer_openai_key')) {
            add_option('ontologizer_openai_key', '');
        }
        if (!get_option('ontologizer_google_kg_key')) {
            add_option('ontologizer_google_kg_key', '');
        }
        if (!get_option('ontologizer_gemini_key')) {
            add_option('ontologizer_gemini_key', '');
        }
        if (!get_option('ontologizer_cache_duration')) {
            add_option('ontologizer_cache_duration', 3600);
        }
        if (!get_option('ontologizer_rate_limit_delay')) {
            add_option('ontologizer_rate_limit_delay', 0.2);
        }
        if (!get_option('ontologizer_debug_mode')) {
            add_option('ontologizer_debug_mode', false);
        }
        if (!get_option('ontologizer_max_entities')) {
            add_option('ontologizer_max_entities', 20);
        }
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function deactivate() {
        // Clear any scheduled events
        wp_clear_scheduled_hook('ontologizer_cleanup_cache');
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function register_settings() {
        register_setting('ontologizer_options', 'ontologizer_openai_key', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field'
        ));
        register_setting('ontologizer_options', 'ontologizer_google_kg_key', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field'
        ));
        register_setting('ontologizer_options', 'ontologizer_gemini_key', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field'
        ));
        register_setting('ontologizer_options', 'ontologizer_cache_duration', array(
            'type' => 'integer',
            'default' => 3600,
            'sanitize_callback' => 'intval'
        ));
        register_setting('ontologizer_options', 'ontologizer_rate_limit_delay', array(
            'type' => 'float',
            'default' => 0.2,
            'sanitize_callback' => 'floatval'
        ));
        register_setting('ontologizer_options', 'ontologizer_debug_mode', array(
            'type' => 'boolean',
            'default' => false,
            'sanitize_callback' => 'rest_sanitize_boolean'
        ));
        register_setting('ontologizer_options', 'ontologizer_max_entities', array(
            'type' => 'integer',
            'default' => 20,
            'sanitize_callback' => 'intval'
        ));
        
        // Add settings sections
        add_settings_section(
            'ontologizer_api_section',
            __('API Configuration', 'ontologizer'),
            array($this, 'api_section_callback'),
            'ontologizer_options'
        );
        
        add_settings_section(
            'ontologizer_performance_section',
            __('Performance Settings', 'ontologizer'),
            array($this, 'performance_section_callback'),
            'ontologizer_options'
        );
        
        add_settings_section(
            'ontologizer_debug_section',
            __('Debug Settings', 'ontologizer'),
            array($this, 'debug_section_callback'),
            'ontologizer_options'
        );
        
        // Add settings fields
        add_settings_field(
            'ontologizer_openai_key',
            __('OpenAI API Key', 'ontologizer'),
            array($this, 'openai_key_callback'),
            'ontologizer_options',
            'ontologizer_api_section'
        );
        
        add_settings_field(
            'ontologizer_google_kg_key',
            __('Google Knowledge Graph API Key', 'ontologizer'),
            array($this, 'google_kg_key_callback'),
            'ontologizer_options',
            'ontologizer_api_section'
        );
        
        add_settings_field(
            'ontologizer_gemini_key',
            __('Google Gemini API Key', 'ontologizer'),
            array($this, 'gemini_key_callback'),
            'ontologizer_options',
            'ontologizer_api_section'
        );
        
        add_settings_field(
            'ontologizer_cache_duration',
            __('Cache Duration (seconds)', 'ontologizer'),
            array($this, 'cache_duration_callback'),
            'ontologizer_options',
            'ontologizer_performance_section'
        );
        
        add_settings_field(
            'ontologizer_rate_limit_delay',
            __('Rate Limit Delay (seconds)', 'ontologizer'),
            array($this, 'rate_limit_delay_callback'),
            'ontologizer_options',
            'ontologizer_performance_section'
        );
        
        add_settings_field(
            'ontologizer_debug_mode',
            __('Debug Mode', 'ontologizer'),
            array($this, 'debug_mode_callback'),
            'ontologizer_options',
            'ontologizer_debug_section'
        );
        
        add_settings_field(
            'ontologizer_max_entities',
            __('Max Entities to Enrich', 'ontologizer'),
            array($this, 'max_entities_callback'),
            'ontologizer_options',
            'ontologizer_performance_section'
        );
    }
    
    public function api_section_callback() {
        echo '<p>' . __('Configure API keys for enhanced entity extraction and enrichment.', 'ontologizer') . '</p>';
    }
    
    public function performance_section_callback() {
        echo '<p>' . __('Configure performance settings for optimal operation.', 'ontologizer') . '</p>';
    }
    
    public function debug_section_callback() {
        echo '<p>' . __('Configure debugging settings.', 'ontologizer') . '</p>';
    }
    
    public function openai_key_callback() {
        $value = get_option('ontologizer_openai_key');
        echo '<input type="password" id="ontologizer_openai_key" name="ontologizer_openai_key" value="' . esc_attr($value) . '" class="regular-text">';
        echo '<p class="description">' . __('Optional. Used for improved entity extraction. Get your key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>.', 'ontologizer') . '</p>';
    }
    
    public function google_kg_key_callback() {
        $value = get_option('ontologizer_google_kg_key');
        echo '<input type="password" id="ontologizer_google_kg_key" name="ontologizer_google_kg_key" value="' . esc_attr($value) . '" class="regular-text">';
        echo '<p class="description">' . __('Optional. Used for enhanced entity enrichment. Get your key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a>.', 'ontologizer') . '</p>';
    }
    
    public function gemini_key_callback() {
        $value = get_option('ontologizer_gemini_key');
        echo '<input type="password" id="ontologizer_gemini_key" name="ontologizer_gemini_key" value="' . esc_attr($value) . '" class="regular-text">';
        echo '<p class="description">' . __('Optional. Used for Google AI Mode query fan-out analysis. Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.', 'ontologizer') . '</p>';
    }
    
    public function cache_duration_callback() {
        $value = get_option('ontologizer_cache_duration', 3600);
        echo '<input type="number" id="ontologizer_cache_duration" name="ontologizer_cache_duration" value="' . esc_attr($value) . '" class="small-text" min="300" max="86400">';
        echo '<p class="description">' . __('How long to cache results (300-86400 seconds).', 'ontologizer') . '</p>';
    }
    
    public function rate_limit_delay_callback() {
        $value = get_option('ontologizer_rate_limit_delay', 0.2);
        echo '<input type="number" id="ontologizer_rate_limit_delay" name="ontologizer_rate_limit_delay" value="' . esc_attr($value) . '" class="small-text" min="0" max="5" step="0.1">';
        echo '<p class="description">' . __('Delay between API calls to avoid rate limiting (0-5 seconds). Default: 0.2s', 'ontologizer') . '</p>';
    }
    
    public function debug_mode_callback() {
        $value = get_option('ontologizer_debug_mode', false);
        echo '<input type="checkbox" id="ontologizer_debug_mode" name="ontologizer_debug_mode" value="1" ' . checked($value, true, false) . '>';
        echo '<p class="description">' . __('Enable debugging mode.', 'ontologizer') . '</p>';
    }
    
    public function max_entities_callback() {
        $value = get_option('ontologizer_max_entities', 20);
        echo '<input type="number" id="ontologizer_max_entities" name="ontologizer_max_entities" value="' . esc_attr($value) . '" class="small-text" min="1" max="100">';
        echo '<p class="description">' . __('Maximum number of entities to enrich.', 'ontologizer') . '</p>';
    }
    
    public function enqueue_scripts() {
        wp_enqueue_script('ontologizer-frontend', ONTOLOGIZER_PLUGIN_URL . 'assets/js/frontend.js', array('jquery'), ONTOLOGIZER_VERSION, true);
        wp_enqueue_style('ontologizer-frontend', ONTOLOGIZER_PLUGIN_URL . 'assets/css/frontend.css', array(), ONTOLOGIZER_VERSION);
        
        wp_localize_script('ontologizer-frontend', 'ontologizer_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('ontologizer_nonce'),
            'version' => ONTOLOGIZER_VERSION
        ));
    }
    
    public function admin_enqueue_scripts($hook) {
        if ($hook !== 'toplevel_page_ontologizer') {
            return;
        }
        
        wp_enqueue_style('ontologizer-admin', ONTOLOGIZER_PLUGIN_URL . 'assets/css/frontend.css', array(), ONTOLOGIZER_VERSION);
        
        wp_enqueue_script('ontologizer-admin', ONTOLOGIZER_PLUGIN_URL . 'assets/js/admin.js', array('jquery'), ONTOLOGIZER_VERSION, true);
        wp_localize_script('ontologizer-admin', 'ontologizer_admin_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('ontologizer_admin_nonce')
        ));
    }
    
    public function add_admin_menu() {
        add_menu_page(
            __('Ontologizer', 'ontologizer'),
            __('Ontologizer', 'ontologizer'),
            'manage_options',
            'ontologizer',
            array($this, 'admin_page'),
            'dashicons-admin-links',
            30
        );
    }
    
    public function admin_page() {
        include ONTOLOGIZER_PLUGIN_PATH . 'templates/admin-page.php';
    }
    
    public function shortcode($atts) {
        $atts = shortcode_atts(array(
            'title' => __('Ontologizer', 'ontologizer'),
            'placeholder' => __('Enter a URL to analyze...', 'ontologizer')
        ), $atts);
        
        // Make attributes available to the template
        $title = $atts['title'];
        $placeholder = $atts['placeholder'];
        
        ob_start();
        include ONTOLOGIZER_PLUGIN_PATH . 'templates/frontend-form.php';
        return ob_get_clean();
    }
    
    public function process_url_ajax() {
        check_ajax_referer('ontologizer_nonce', 'nonce');
        $url = isset($_POST['url']) ? sanitize_url($_POST['url']) : '';
        $paste_content = isset($_POST['paste_content']) ? trim(stripslashes($_POST['paste_content'])) : '';
        $main_topic_strategy = isset($_POST['main_topic_strategy']) ? sanitize_text_field($_POST['main_topic_strategy']) : 'strict';
        $clear_cache = isset($_POST['clear_cache']) && $_POST['clear_cache'] == 1;
        $run_fanout_analysis = isset($_POST['run_fanout_analysis']) && $_POST['run_fanout_analysis'] == 1;
        $fanout_only = isset($_POST['fanout_only']) && $_POST['fanout_only'] == 1;
        $debug_mode = get_option('ontologizer_debug_mode', false);
        $debug_info = [];
        if (empty($url) && empty($paste_content)) {
            wp_send_json_error(__('Please provide a URL or paste content.', 'ontologizer'));
        }
        try {
            $processor = new OntologizerProcessor();
            if (!empty($url) && $clear_cache) {
                // Remove cache for this URL
                $cache_key = 'ontologizer_' . md5($url);
                delete_transient($cache_key);
            }
            if (!empty($paste_content)) {
                if ($fanout_only) {
                    $result = $processor->process_fanout_analysis_only($paste_content);
                } else {
                    $result = $processor->process_pasted_content($paste_content, $main_topic_strategy, $run_fanout_analysis);
                }
            } else {
                if ($fanout_only) {
                    $result = $processor->process_fanout_analysis_only_url($url);
                } else {
                    $result = $processor->process_url($url, $main_topic_strategy, $run_fanout_analysis);
                }
            }
            wp_send_json_success($result);
        } catch (Exception $e) {
            if ($debug_mode) {
                $debug_info[] = 'Exception: ' . $e->getMessage();
                wp_send_json_error(['message' => $e->getMessage(), 'debug_info' => $debug_info]);
            } else {
                wp_send_json_error($e->getMessage());
            }
        }
    }

    public function clear_cache_ajax() {
        check_ajax_referer('ontologizer_admin_nonce', 'nonce');
    
        if (!current_user_can('manage_options')) {
            wp_send_json_error(__('You do not have permission to perform this action.', 'ontologizer'));
        }
    
        global $wpdb;
        $transient_prefix = '_transient_ontologizer_';
        $timeout_prefix = '_transient_timeout_ontologizer_';
    
        // Get the count of cached items before deleting
        $sql_count = "SELECT COUNT(option_id) FROM {$wpdb->options} WHERE option_name LIKE %s";
        $count = $wpdb->get_var($wpdb->prepare($sql_count, $wpdb->esc_like($transient_prefix) . '%'));
    
        // Delete the transients and their timeouts
        $sql_delete = "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s";
        $result = $wpdb->query($wpdb->prepare($sql_delete, $wpdb->esc_like($transient_prefix) . '%', $wpdb->esc_like($timeout_prefix) . '%'));
    
        if ($result === false) {
            wp_send_json_error(__('An error occurred while clearing the cache.', 'ontologizer'));
        }
    
        wp_send_json_success(sprintf(_n('%d cached item has been cleared.', '%d cached items have been cleared.', $count, 'ontologizer'), $count));
    }

    public function list_cache_ajax() {
        check_ajax_referer('ontologizer_admin_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error(__('You do not have permission to perform this action.', 'ontologizer'));
        }
        global $wpdb;
        $transient_prefix = '_transient_ontologizer_';
        $sql = "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s";
        $results = $wpdb->get_results($wpdb->prepare($sql, $wpdb->esc_like($transient_prefix) . '%'));
        $processor = new OntologizerProcessor();
        $cache_list = array();
        foreach ($results as $row) {
            $data = maybe_unserialize($row->option_value);
            $summary = $processor->get_cache_summary($data);
            $summary['cache_key'] = $row->option_name;
            $cache_list[] = $summary;
        }
        wp_send_json_success($cache_list);
    }

    public function delete_cache_entry_ajax() {
        check_ajax_referer('ontologizer_admin_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error(__('You do not have permission to perform this action.', 'ontologizer'));
        }
        $cache_key = sanitize_text_field($_POST['cache_key']);
        if (empty($cache_key)) {
            wp_send_json_error('No cache key provided.');
        }
        global $wpdb;
        $sql = "DELETE FROM {$wpdb->options} WHERE option_name = %s OR option_name = %s";
        $timeout_key = str_replace('_transient_', '_transient_timeout_', $cache_key);
        $wpdb->query($wpdb->prepare($sql, $cache_key, $timeout_key));
        wp_send_json_success('Cache entry deleted.');
    }
}

// Initialize the plugin
new Ontologizer();
}  