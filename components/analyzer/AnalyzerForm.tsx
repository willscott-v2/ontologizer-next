'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'url'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Analyze URL
            </button>
            <button
              type="button"
              onClick={() => setMode('paste')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'paste'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste Content
            </button>
          </div>

          {/* Input */}
          {mode === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="url">URL to analyze</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page-to-analyze"
                disabled={isAnalyzing}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="paste">Paste HTML, Markdown, or plain text</Label>
              <textarea
                id="paste"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your content here..."
                rows={6}
                disabled={isAnalyzing}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Label htmlFor="strategy" className="text-gray-500">
                Topic strategy:
              </Label>
              <select
                id="strategy"
                value={mainTopicStrategy}
                onChange={(e) => setMainTopicStrategy(e.target.value as MainTopicStrategy)}
                disabled={isAnalyzing}
                className="rounded-md border px-2 py-1 text-sm"
              >
                <option value="strict">Title + Body (strict)</option>
                <option value="title">Title only</option>
                <option value="frequent">Most frequent</option>
                <option value="pattern">Pattern match</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-gray-500">
              <input
                type="checkbox"
                checked={clearCache}
                onChange={(e) => setClearCache(e.target.checked)}
                disabled={isAnalyzing}
              />
              Fresh analysis
            </label>

            <label className="flex items-center gap-1.5 text-gray-500">
              <input
                type="checkbox"
                checked={runFanout}
                onChange={(e) => {
                  setRunFanout(e.target.checked);
                  if (!e.target.checked) setFanoutOnly(false);
                }}
                disabled={isAnalyzing}
              />
              Fan-out analysis
            </label>

            {runFanout && (
              <label className="flex items-center gap-1.5 text-gray-500">
                <input
                  type="checkbox"
                  checked={fanoutOnly}
                  onChange={(e) => setFanoutOnly(e.target.checked)}
                  disabled={isAnalyzing}
                />
                Fan-out only
              </label>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isAnalyzing || !hasInput || !canSubmit}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze'
              )}
            </Button>

            {!canSubmit && (
              <p className="text-sm text-gray-500">
                <a href="/auth/login" className="text-blue-600 hover:underline">Sign in</a>
                {' '}for free analyses or{' '}
                <a href="/settings" className="text-blue-600 hover:underline">add API keys</a>
              </p>
            )}

            {hasApiKeys && <Badge variant="secondary">Using your API keys</Badge>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
