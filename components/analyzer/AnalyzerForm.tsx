'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Search, ClipboardPaste, Loader2 } from 'lucide-react';
import type { AnalyzeParams, MainTopicStrategy } from '@/lib/types/analysis';

interface AnalyzerFormProps {
  onSubmit: (params: AnalyzeParams) => void;
  isAnalyzing: boolean;
  hasApiKeys?: boolean;
  isSignedIn?: boolean;
}

export function AnalyzerForm({ onSubmit, isAnalyzing, hasApiKeys, isSignedIn }: AnalyzerFormProps) {
  const [mode, setMode] = useState<'url' | 'paste'>('url');
  const [url, setUrl] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [mainTopicStrategy, setMainTopicStrategy] = useState<MainTopicStrategy>('strict');
  const [clearCache, setClearCache] = useState(false);
  const [runFanout, setRunFanout] = useState(false);
  const [fanoutOnly, setFanoutOnly] = useState(false);

  const canSubmit = hasApiKeys || isSignedIn || (hasApiKeys === undefined && isSignedIn === undefined);
  const hasInput = mode === 'url' ? url.trim() : pasteContent.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput || !canSubmit) return;
    onSubmit({ mode, url, pasteContent, mainTopicStrategy, clearCache, runFanout, fanoutOnly });
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
            <label htmlFor="paste">Paste HTML, Markdown, or plain text</label>
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

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-white/80 mt-6">
        <div
          className="flex items-center gap-2"
          title="How Ontologizer picks the page's main topic. Strict = uses both title and body; Title only = title tag only; Most frequent = most-repeated entity; Pattern = regex-style pattern matching."
        >
          <label htmlFor="strategy" className="text-white/70">
            Topic strategy
            <span className="ml-1 text-white/50" aria-hidden="true">
              ⓘ
            </span>
          </label>
          <select
            id="strategy"
            value={mainTopicStrategy}
            onChange={(e) => setMainTopicStrategy(e.target.value as MainTopicStrategy)}
            disabled={isAnalyzing}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white"
          >
            <option value="strict">Title + Body (strict)</option>
            <option value="title">Title only</option>
            <option value="frequent">Most frequent</option>
            <option value="pattern">Pattern match</option>
          </select>
        </div>

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
          title="Also run Gemini fan-out: a simulation of how Google AI Mode decomposes queries about this page, with coverage scoring per sub-query."
        >
          <input
            type="checkbox"
            checked={runFanout}
            onChange={(e) => {
              setRunFanout(e.target.checked);
              if (!e.target.checked) setFanoutOnly(false);
            }}
            disabled={isAnalyzing}
            className="accent-[var(--orange-accent)]"
          />
          Fan-out analysis
          <span className="text-white/40" aria-hidden="true">ⓘ</span>
        </label>

        {runFanout && (
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            title="Skip entity enrichment, JSON-LD, and recommendations — run only the fan-out step. Fastest path if you just want the query-decomposition report."
          >
            <input
              type="checkbox"
              checked={fanoutOnly}
              onChange={(e) => setFanoutOnly(e.target.checked)}
              disabled={isAnalyzing}
              className="accent-[var(--orange-accent)]"
            />
            Fan-out only
            <span className="text-white/40" aria-hidden="true">ⓘ</span>
          </label>
        )}

        {hasApiKeys && <Badge variant="secondary">Using your API keys</Badge>}
      </div>

      {!canSubmit && (
        <p className="text-sm text-white/70 mt-4">
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
