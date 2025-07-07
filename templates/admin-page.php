<div class="wrap">
    <h1><?php _e('Ontologizer Settings', 'ontologizer'); ?></h1>
    
    <div class="ontologizer-admin-container">
        <div class="ontologizer-admin-form">
            <form method="post" action="options.php">
                <?php
                settings_fields('ontologizer_options');
                do_settings_sections('ontologizer_options');
                submit_button(__('Save Settings', 'ontologizer'));
                ?>
            </form>
        </div>
        
        <div class="ontologizer-admin-usage">
            <h2><?php _e('Usage', 'ontologizer'); ?></h2>
            <p><?php _e('Use the shortcode <code>[ontologizer]</code> in any post or page to display the Ontologizer form.', 'ontologizer'); ?></p>
            
            <h3><?php _e('Shortcode Options', 'ontologizer'); ?></h3>
            <ul>
                <li><code>title</code> - <?php _e('Custom title for the form (default: "Ontologizer")', 'ontologizer'); ?></li>
                <li><code>placeholder</code> - <?php _e('Custom placeholder text for the URL input', 'ontologizer'); ?></li>
            </ul>
            
            <h3><?php _e('Example', 'ontologizer'); ?></h3>
            <pre><code>[ontologizer title="Entity Extractor" placeholder="Enter webpage URL..."]</code></pre>
            
            <h3><?php _e('Fan-out Analysis Preview', 'ontologizer'); ?></h3>
            <p><?php _e('The new Google AI Mode query fan-out analysis provides rich, structured insights:', 'ontologizer'); ?></p>
            <ul>
                <li><?php _e('<strong>Primary Entity Identification:</strong> Automatically identifies the main topic', 'ontologizer'); ?></li>
                <li><?php _e('<strong>Predicted Fan-out Queries:</strong> 8-10 likely sub-queries Google\'s AI might generate', 'ontologizer'); ?></li>
                <li><?php _e('<strong>Coverage Assessment:</strong> Visual indicators showing Yes/Partial/No coverage', 'ontologizer'); ?></li>
                <li><?php _e('<strong>Interactive Results:</strong> Beautiful cards, progress indicators, and structured layout', 'ontologizer'); ?></li>
                <li><?php _e('<strong>Actionable Recommendations:</strong> Specific content gaps and optimization suggestions', 'ontologizer'); ?></li>
            </ul>
            
            <h2><?php _e('How It Works', 'ontologizer'); ?></h2>
            <ol>
                <li><?php _e('Enter a URL to analyze', 'ontologizer'); ?></li>
                <li><?php _e('The system extracts named entities from the webpage', 'ontologizer'); ?></li>
                <li><?php _e('Entities are enriched with data from Wikipedia, Wikidata, Google Knowledge Graph, and ProductOntology', 'ontologizer'); ?></li>
                <li><?php _e('JSON-LD structured data is generated for SEO optimization', 'ontologizer'); ?></li>
                <li><?php _e('Content recommendations are provided for improvement', 'ontologizer'); ?></li>
                <li><?php _e('<strong>NEW:</strong> Google AI Mode query fan-out analysis predicts how Google\'s AI might decompose user queries about your content', 'ontologizer'); ?></li>
            </ol>
        </div>
        
        <div class="ontologizer-admin-cache-management">
            <h2><?php _e('Cache Management', 'ontologizer'); ?></h2>
            <p><?php _e('The plugin caches results to improve performance and avoid excessive API calls. If you are not seeing updated results from a URL you have recently analyzed, you can clear the cache manually.', 'ontologizer'); ?></p>
            <button id="ontologizer-clear-cache" class="button button-secondary">
                <span class="dashicons dashicons-trash"></span>
                <?php _e('Clear All Cached Results', 'ontologizer'); ?>
            </button>
            <span class="spinner"></span>
            <p id="ontologizer-cache-feedback" class="ontologizer-cache-feedback" style="display:none;"></p>
        </div>
        <div class="ontologizer-admin-cache-log">
            <h2><?php _e('Cached Runs Log', 'ontologizer'); ?></h2>
            <div id="ontologizer-cache-log-list">
                <p><?php _e('Loading cached runs...', 'ontologizer'); ?></p>
            </div>
        </div>
    </div>
    
    <div class="ontologizer-admin-footer">
        <p>
            <?php
            printf(
                /* translators: %s: Plugin version number */
                esc_html__('Ontologizer Version %s', 'ontologizer'),
                esc_html(ONTOLOGIZER_VERSION)
            );
            ?>
        </p>
    </div>
</div>
<script>
jQuery(document).ready(function($) {
    function loadCacheLog() {
        var list = $('#ontologizer-cache-log-list');
        list.html('<p>Loading cached runs...</p>');
        $.ajax({
            url: ontologizer_admin_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'ontologizer_list_cache',
                nonce: ontologizer_admin_ajax.nonce
            },
            success: function(response) {
                if (response.success && response.data.length > 0) {
                    var html = '<table class="widefat"><thead><tr><th>URL</th><th>Primary Topic</th><th>Salience</th><th>Confidence</th><th>Action</th></tr></thead><tbody>';
                    response.data.forEach(function(entry) {
                        html += '<tr>' +
                            '<td style="word-break:break-all">' + (entry.url || '-') + '</td>' +
                            '<td>' + (entry.primary_topic || '-') + '</td>' +
                            '<td>' + (entry.topical_salience || '-') + '%</td>' +
                            '<td>' + (entry.main_topic_confidence || '-') + '%</td>' +
                            '<td><button class="button delete-cache-entry" data-cache-key="' + entry.cache_key + '">Delete</button></td>' +
                            '</tr>';
                    });
                    html += '</tbody></table>';
                    list.html(html);
                } else {
                    list.html('<p>No cached runs found.</p>');
                }
            },
            error: function() {
                list.html('<p>Error loading cache log.</p>');
            }
        });
    }
    loadCacheLog();
    $(document).on('click', '.delete-cache-entry', function() {
        var btn = $(this);
        var key = btn.data('cache-key');
        btn.prop('disabled', true).text('Deleting...');
        $.ajax({
            url: ontologizer_admin_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'ontologizer_delete_cache_entry',
                nonce: ontologizer_admin_ajax.nonce,
                cache_key: key
            },
            success: function(response) {
                loadCacheLog();
            },
            error: function() {
                btn.prop('disabled', false).text('Delete');
                alert('Error deleting cache entry.');
            }
        });
    });
});
</script> 