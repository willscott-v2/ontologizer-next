<?php
/**
 * Ontologizer Plugin Installation Script
 * 
 * This script helps verify that your WordPress installation is ready for the Ontologizer plugin.
 * Run this file in your browser to check compatibility and requirements.
 */

// Prevent direct access if not in WordPress context
if (!defined('ABSPATH') && !isset($_GET['standalone'])) {
    echo '<h1>Ontologizer Plugin Installation Check</h1>';
    echo '<p>This script should be run from within WordPress or with ?standalone=1 parameter.</p>';
    exit;
}

// If running standalone, set up basic environment
if (isset($_GET['standalone'])) {
    echo '<!DOCTYPE html>
    <html>
    <head>
        <title>Ontologizer Plugin Installation Check</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .check { margin: 10px 0; padding: 10px; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        </style>
    </head>
    <body>';
}

function check_requirement($name, $check, $required = true) {
    $result = $check();
    $class = $result ? 'success' : ($required ? 'error' : 'warning');
    $status = $result ? '✓ PASS' : ($required ? '✗ FAIL' : '⚠ WARNING');
    echo "<div class='check {$class}'><strong>{$name}:</strong> {$status}</div>";
    return $result;
}

function check_php_version() {
    return version_compare(PHP_VERSION, '7.4.0', '>=');
}

function check_curl_extension() {
    return extension_loaded('curl');
}

function check_json_extension() {
    return extension_loaded('json');
}

function check_allow_url_fopen() {
    return ini_get('allow_url_fopen');
}

function check_wp_version() {
    global $wp_version;
    return version_compare($wp_version, '5.0.0', '>=');
}

function check_plugin_directory() {
    $plugin_dir = WP_PLUGIN_DIR . '/ontologizer';
    return is_dir($plugin_dir) && is_readable($plugin_dir);
}

function check_required_files() {
    $files = [
        'ontologizer.php',
        'includes/class-ontologizer-processor.php',
        'templates/frontend-form.php',
        'templates/admin-page.php',
        'assets/js/frontend.js',
        'assets/css/frontend.css'
    ];
    
    $missing = [];
    foreach ($files as $file) {
        if (!file_exists(WP_PLUGIN_DIR . '/ontologizer/' . $file)) {
            $missing[] = $file;
        }
    }
    
    return empty($missing);
}

function test_wikipedia_api() {
    $url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=test&limit=1&format=json';
    $response = wp_remote_get($url);
    return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
}

function test_productontology_api() {
    $url = 'http://www.productontology.org/id/Test';
    $response = wp_remote_head($url);
    return !is_wp_error($response);
}

// Run checks
echo '<h1>Ontologizer Plugin Installation Check</h1>';

echo '<h2>System Requirements</h2>';
check_requirement('PHP Version (>= 7.4)', 'check_php_version');
check_requirement('cURL Extension', 'check_curl_extension');
check_requirement('JSON Extension', 'check_json_extension');
check_requirement('allow_url_fopen', 'check_allow_url_fopen', false);

if (function_exists('check_wp_version')) {
    echo '<h2>WordPress Requirements</h2>';
    check_requirement('WordPress Version (>= 5.0)', 'check_wp_version');
    check_requirement('Plugin Directory', 'check_plugin_directory');
    check_requirement('Required Files', 'check_required_files');
}

echo '<h2>API Connectivity</h2>';
check_requirement('Wikipedia API', 'test_wikipedia_api');
check_requirement('ProductOntology API', 'test_productontology_api');

echo '<h2>Installation Instructions</h2>';
echo '<div class="check info">';
echo '<strong>To install the Ontologizer plugin:</strong><br>';
echo '1. Upload all plugin files to <code>/wp-content/plugins/ontologizer/</code><br>';
echo '2. Activate the plugin in WordPress Admin → Plugins<br>';
echo '3. Configure API keys in WordPress Admin → Ontologizer (optional)<br>';
echo '4. Use the shortcode <code>[ontologizer]</code> in any post or page';
echo '</div>';

echo '<h2>Usage</h2>';
echo '<div class="check info">';
echo '<strong>Quick Start:</strong><br>';
echo '• Add <code>[ontologizer]</code> to any post or page<br>';
echo '• Enter a URL to analyze<br>';
echo '• Get enriched entities and JSON-LD structured data<br>';
echo '• Receive content optimization recommendations';
echo '</div>';

if (isset($_GET['standalone'])) {
    echo '</body></html>';
}
?> 