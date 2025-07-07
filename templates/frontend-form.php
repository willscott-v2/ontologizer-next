<div class="ontologizer-container">
    <div class="ontologizer-form">
        <h3><?php echo esc_html($title); ?></h3>
        <p class="ontologizer-description">
            Enter a URL to automatically extract named entities and generate structured data markup, or paste content directly for analysis.
        </p>
        
        <form id="ontologizer-form">
            <div class="form-group">
                <label><input type="radio" name="input_mode" value="url" checked> Analyze by URL</label>
                <label style="margin-left:1.5em;"><input type="radio" name="input_mode" value="paste"> Paste Content</label>
            </div>
            <div class="form-group" id="url-input-group">
                <input type="url" 
                       id="ontologizer-url" 
                       name="url" 
                       placeholder="<?php echo esc_attr($placeholder); ?>" 
                       class="ontologizer-input">
            </div>
            <div class="form-group" id="paste-input-group" style="display:none;">
                <label for="ontologizer-paste">Paste Content (supports HTML, Markdown, or Plain Text):</label>
                <textarea id="ontologizer-paste" 
                          name="paste_content" 
                          rows="12" 
                          class="ontologizer-input" 
                          placeholder="Paste content here...&#10;&#10;✓ HTML: Copy webpage source or article HTML&#10;✓ Markdown: Paste from docs, GitHub, or markdown files&#10;✓ Plain Text: Copy article text with basic formatting&#10;&#10;The system will automatically detect the format and extract entities accordingly."></textarea>
            </div>
            <div class="form-group">
                <label for="main-topic-strategy">Main Topic Selection:</label>
                <select id="main-topic-strategy" name="main_topic_strategy" class="ontologizer-input">
                    <option value="strict" selected>Strict (title and body)</option>
                    <option value="title">Title only</option>
                    <option value="frequent">Most frequent phrase</option>
                    <option value="pattern">Use page title if it matches a pattern</option>
                </select>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="ontologizer-clear-cache" name="clear_cache" value="1">
                    Override cache for this URL (force fresh analysis)
                </label>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="ontologizer-fanout-analysis" name="run_fanout_analysis" value="1">
                    Run Google AI Mode query fan-out analysis alongside regular analysis (requires Gemini API key)
                </label>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="ontologizer-fanout-only" name="fanout_only" value="1">
                    Run ONLY fan-out analysis (skip entity extraction and schema generation)
                </label>
            </div>
            <button type="submit" class="ontologizer-button">
                <span class="button-text">Analyze</span>
                <span class="loading-spinner" style="display: none;">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                            <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
                        </circle>
                    </svg>
                </span>
            </button>
        </form>
        
        <div class="ontologizer-version">
            <small>Ontologizer v<?php echo esc_html(ONTOLOGIZER_VERSION); ?></small>
        </div>
    </div>
    
    <div id="ontologizer-results" class="ontologizer-results" style="display: none;">
        <div id="ontologizer-salience-score-container" style="display: none;"></div>
        <div class="results-header">
            <h4>Analysis Results</h4>
            <button id="ontologizer-copy-json" class="copy-button">Copy JSON-LD</button>
        </div>
        
        <div class="results-tabs">
            <button class="tab-button active" data-tab="entities">Entities</button>
            <button class="tab-button" data-tab="json-ld">JSON-LD</button>
            <button class="tab-button" data-tab="recommendations">Recommendations</button>
            <button class="tab-button" data-tab="fanout" style="display:none;">Fan-out Analysis</button>
        </div>
        
        <div class="tab-content">
            <div id="tab-entities" class="tab-pane active">
                <div id="entities-list"></div>
            </div>
            
            <div id="tab-json-ld" class="tab-pane">
                <pre id="json-ld-output"></pre>
            </div>
            
            <div id="tab-recommendations" class="tab-pane">
                <div id="recommendations-list"></div>
            </div>
            
            <div id="tab-fanout" class="tab-pane">
                <div id="fanout-analysis-content"></div>
            </div>
        </div>
    </div>
    
    <div id="ontologizer-error" class="ontologizer-error" style="display: none;">
        <p id="error-message"></p>
    </div>
</div> 