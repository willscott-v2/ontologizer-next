'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  ClipboardPaste,
  KeyRound,
  Loader2,
  LogIn,
  Search,
} from 'lucide-react';
import type { AnalyzeParams } from '@/lib/types/analysis';

interface AnalyzerFormProps {
  onSubmit: (params: AnalyzeParams) => void;
  isAnalyzing: boolean;
  hasApiKeys?: boolean;
  isSignedIn?: boolean;
  isEligibilityLoading?: boolean;
}

export function AnalyzerForm({
  onSubmit,
  isAnalyzing,
  hasApiKeys = false,
  isSignedIn = false,
  isEligibilityLoading = false,
}: AnalyzerFormProps) {
  const [mode, setMode] = useState<'url' | 'paste'>('url');
  const [url, setUrl] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState<'text' | 'html'>('text');
  const [mainTopicOverride, setMainTopicOverride] = useState('');
  const [clearCache, setClearCache] = useState(false);
  const [runFanout, setRunFanout] = useState(false);

  const canSubmit = !isEligibilityLoading && (hasApiKeys || isSignedIn);
  const hasInput = mode === 'url' ? url.trim() : pasteContent.trim();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasInput || !canSubmit) return;
    onSubmit({
      mode,
      url,
      pasteContent,
      pasteFormat,
      mainTopicOverride,
      clearCache,
      runFanout,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="analyzer-form">
      <div className="input-mode-toggle" aria-label="Analysis input type">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={mode === 'url' ? 'active' : ''}
          disabled={isAnalyzing}
          aria-pressed={mode === 'url'}
        >
          <Search className="h-4 w-4" />
          Analyze URL
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={mode === 'paste' ? 'active' : ''}
          disabled={isAnalyzing}
          aria-pressed={mode === 'paste'}
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste content
        </button>
      </div>

      {mode === 'url' ? (
        <div className="analyzer-input-block">
          <label htmlFor="url">Website URL</label>
          <div className="url-input-group">
            <input
              id="url"
              aria-label="Page URL"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/page-to-analyze"
              disabled={isAnalyzing}
              className="url-input"
            />
            <button
              type="submit"
              disabled={isAnalyzing || !hasInput || !canSubmit}
              className="analyze-btn"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Analyze page
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="analyzer-input-block">
          <div className="paste-input-heading">
            <label htmlFor="paste">Page content</label>
            <label htmlFor="paste-format" className="paste-format-label">
              Format
              <select
                id="paste-format"
                value={pasteFormat}
                onChange={(event) => setPasteFormat(event.target.value as 'text' | 'html')}
                disabled={isAnalyzing}
                className="paste-format-select"
              >
                <option value="text">Plain text or Markdown</option>
                <option value="html">HTML</option>
              </select>
            </label>
          </div>
          <textarea
            id="paste"
            value={pasteContent}
            onChange={(event) => setPasteContent(event.target.value)}
            placeholder="Paste the page copy or HTML you want to review."
            rows={7}
            disabled={isAnalyzing}
            className="si-textarea"
          />
          <button
            type="submit"
            disabled={isAnalyzing || !hasInput || !canSubmit}
            className="analyze-btn analyze-btn-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <ClipboardPaste className="h-4 w-4" />
                Analyze content
              </>
            )}
          </button>
        </div>
      )}

      <details className="advanced-options">
        <summary>Advanced options</summary>
        <p className="advanced-options-help">
          Override the detected topic, refresh source data, or add modeled question coverage.
        </p>
        <div className="advanced-options-grid">
          <label className="advanced-field" htmlFor="main-topic-override">
            <span>Main topic override</span>
            <input
              id="main-topic-override"
              type="text"
              value={mainTopicOverride}
              onChange={(event) => setMainTopicOverride(event.target.value)}
              placeholder="Optional"
              maxLength={120}
              disabled={isAnalyzing}
              className="advanced-text-input"
            />
          </label>

          <label className="advanced-check">
            <input
              type="checkbox"
              checked={clearCache}
              onChange={(event) => setClearCache(event.target.checked)}
              disabled={isAnalyzing}
            />
            Refresh cached source data
          </label>

          <label
            className="advanced-check"
            title="Model likely questions and assess whether this page contains enough information to answer them."
          >
            <input
              type="checkbox"
              checked={runFanout}
              onChange={(event) => setRunFanout(event.target.checked)}
              disabled={isAnalyzing}
            />
            AI Query Coverage
            <span className="option-help" aria-hidden="true">ⓘ</span>
          </label>

          {hasApiKeys && <Badge variant="secondary">Using your API keys</Badge>}
        </div>
      </details>

      <div className={`access-state ${canSubmit ? 'access-state-ready' : ''}`} aria-live="polite">
        {isEligibilityLoading ? (
          <span>Checking analysis access…</span>
        ) : canSubmit ? (
          <span>
            <CheckCircle2 className="size-4" />
            {hasApiKeys ? 'Ready with your API keys' : 'Signed in and ready to analyze'}
          </span>
        ) : (
          <>
            <p>Choose how you want to run the analysis.</p>
            <div className="access-actions">
              <a href="/auth/login"><LogIn className="size-4" /> Sign in for 5 free</a>
              <a href="/settings"><KeyRound className="size-4" /> Add API keys</a>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
