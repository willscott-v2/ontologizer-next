'use client';

import { useState } from 'react';
import { AnalyzerForm, type AnalyzeParams } from '@/components/analyzer/AnalyzerForm';
import { useApiKeys } from '@/hooks/useApiKeys';
import { useAuth } from '@/hooks/useAuth';
import type { AnalysisResult, AnalysisStep } from '@/lib/types/analysis';

export default function HomePage() {
  const { hasAnyKey, apiHeaders, loaded: keysLoaded } = useApiKeys();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAnalyzing = step !== 'idle' && step !== 'complete' && step !== 'error';

  async function handleAnalyze(params: AnalyzeParams) {
    setStep('extracting');
    setError(null);
    setResult(null);

    // TODO: Wire up the 4-step pipeline here
    // Step 1: POST /api/analyze/extract
    // Step 2: POST /api/analyze/enrich (batched)
    // Step 3: POST /api/analyze/generate
    // Step 4: POST /api/analyze/fanout (optional)

    // For now, show a placeholder message
    setTimeout(() => {
      setStep('error');
      setError('Pipeline not yet connected. The API routes are stubbed out -- build Phase 2 next.');
    }, 1000);
  }

  if (!keysLoaded || authLoading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ontologizer</h1>
        <p className="text-gray-500">
          Extract entities, generate JSON-LD structured data, and get SEO recommendations.
        </p>
      </div>

      <AnalyzerForm
        onSubmit={handleAnalyze}
        isAnalyzing={isAnalyzing}
        hasApiKeys={!!hasAnyKey}
        isSignedIn={!!user}
      />

      {/* Progress indicator */}
      {isAnalyzing && (
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <span className="text-sm text-gray-600">
              {step === 'extracting' && 'Fetching and extracting entities...'}
              {step === 'enriching' && 'Enriching entities with external sources...'}
              {step === 'generating' && 'Generating schema and recommendations...'}
              {step === 'fanout' && 'Running fan-out analysis...'}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results placeholder */}
      {result && (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-gray-500">Results will render here (Phase 4).</p>
        </div>
      )}
    </div>
  );
}
