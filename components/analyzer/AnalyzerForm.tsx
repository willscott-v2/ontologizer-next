'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Search, ClipboardPaste, Loader2 } from 'lucide-react';
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput || !canSubmit) return;
    onSubmit({ mode, url, pasteContent, pasteFormat, mainTopicOverride, clearCache, runFanout });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Mode toggle */}
      <div className="input-mode-toggle">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={mode === 'url' ? 'active' : ''}
          disabled={isAnalyzing}
        >
          <Search className="h-4 w-4" />
          Analyze URL
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={mode === 'paste' ? 'active' : ''}
          disabled={isAnalyzing}
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste Content
        </button>
      </div>

      {/* Input */}
      {mode === 'url' ? (
        <div className="url-input-group">
          <input
            id="url"
            aria-label="Page URL"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
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
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="form-group">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="paste">Paste page content</label>
              <label className="flex items-center gap-2 text-sm text-white">
                Format
                <select
                  value={pasteFormat}
                  onChange={(event) => setPasteFormat(event.target.value as 'text' | 'html')}
                  disabled={isAnalyzing}
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white"
                >
                  <option value="text">Plain text or Markdown</option>
                  <option value="html">HTML</option>
                </select>
              </label>
            </div>
            <textarea
              id="paste"
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Paste your content here..."
              rows={8}
              disabled={isAnalyzing}
              className="si-textarea"
            />
          </div>
          <button
            type="submit"
            disabled={isAnalyzing || !hasInput || !canSubmit}
            className="analyze-btn w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze'
            )}
          </button>
        </>
      )}

      <details className="mt-6 rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-white">
        <summary className="cursor-pointer font-semibold text-white">Advanced options</summary>
        <p className="mt-2 text-xs text-white/90">
          Override the detected topic, bypass cached source data, or add optional modeled-question coverage.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-white">
          Main topic override
          <input
            type="text"
            value={mainTopicOverride}
            onChange={(event) => setMainTopicOverride(event.target.value)}
            placeholder="Optional"
            maxLength={120}
            disabled={isAnalyzing}
            className="w-44 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/70"
          />
        </label>

        <label
          className="flex items-center gap-1.5 cursor-pointer"
          title="Skip the 1-hour URL cache and the 7-day entity enrichment cache. Use this if the page has changed recently."
        >
          <input
            type="checkbox"
            checked={clearCache}
            onChange={(e) => setClearCache(e.target.checked)}
            disabled={isAnalyzing}
            className="accent-[var(--orange-accent)]"
          />
          Fresh analysis
          <span className="text-white/40" aria-hidden="true">ⓘ</span>
        </label>

        <label
          className="flex items-center gap-1.5 cursor-pointer"
          title="Model likely questions and assess whether this page contains enough information to answer them."
        >
          <input
            type="checkbox"
            checked={runFanout}
            onChange={(e) => setRunFanout(e.target.checked)}
            disabled={isAnalyzing}
            className="accent-[var(--orange-accent)]"
          />
          AI Query Coverage
          <span className="text-white/40" aria-hidden="true">ⓘ</span>
        </label>

        {hasApiKeys && <Badge variant="secondary">Using your API keys</Badge>}
        </div>
      </details>

      {!isEligibilityLoading && !canSubmit && (
        <p className="mt-4 text-sm text-white/90">
          <a href="/auth/login" className="text-[var(--orange-accent)] hover:underline">
            Sign in
          </a>
          {' '}for free analyses or{' '}
          <a href="/settings" className="text-[var(--orange-accent)] hover:underline">
            add API keys
          </a>
        </p>
      )}
    </form>
  );
}
