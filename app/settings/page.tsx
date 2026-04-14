'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Save, Trash2, ExternalLink, ArrowLeft } from 'lucide-react';
import { useApiKeys } from '@/hooks/useApiKeys';
import { toast } from 'sonner';

function KeyInput({
  id,
  label,
  description,
  helpUrl,
  helpLabel,
  value,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  helpUrl: string;
  helpLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {value && <Badge variant="secondary">Configured</Badge>}
      </div>
      <p className="text-sm text-gray-500">{description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter your ${label.toLowerCase()}`}
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <a
        href={helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
      >
        {helpLabel}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function SettingsPage() {
  const { keys, saveKeys, clearKeys, loaded } = useApiKeys();
  const [draft, setDraft] = useState(keys);

  useEffect(() => {
    if (loaded) setDraft(keys);
  }, [loaded, keys]);

  function handleSave() {
    saveKeys(draft);
    toast.success('API keys saved to browser storage');
  }

  function handleClear() {
    clearKeys();
    setDraft({ openaiKey: '', googleKgKey: '', geminiKey: '' });
    toast.success('API keys cleared');
  }

  if (!loaded) return null;

  return (
    <section className="main-section">
      <div className="si-container">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--orange-accent)] hover:text-[var(--orange-light)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to analyzer
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-white">API Keys</h1>
            <p className="text-white/70">
              Add your own API keys to use Ontologizer without limits.
              Keys are stored in your browser only and sent directly to the APIs.
            </p>
          </div>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            All keys are optional. Without keys, signed-in users get 5 free analyses per month
            using our keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <KeyInput
            id="openai"
            label="OpenAI API Key"
            description="Used for entity extraction and SEO recommendations. Required for analysis."
            helpUrl="https://platform.openai.com/api-keys"
            helpLabel="Get an OpenAI key"
            value={draft.openaiKey}
            onChange={(v) => setDraft({ ...draft, openaiKey: v })}
          />

          <Separator />

          <KeyInput
            id="google-kg"
            label="Google Knowledge Graph API Key"
            description="Used for entity enrichment with Google's Knowledge Graph. Optional but recommended."
            helpUrl="https://console.cloud.google.com/apis/credentials"
            helpLabel="Get a Google Cloud key"
            value={draft.googleKgKey}
            onChange={(v) => setDraft({ ...draft, googleKgKey: v })}
          />

          <Separator />

          <KeyInput
            id="gemini"
            label="Google Gemini API Key"
            description="Used for the fan-out query analysis feature. Required for fan-out only."
            helpUrl="https://aistudio.google.com/app/apikey"
            helpLabel="Get a Gemini key"
            value={draft.geminiKey}
            onChange={(v) => setDraft({ ...draft, geminiKey: v })}
          />

          <Separator />

          <div className="flex gap-3">
            <Button onClick={handleSave}>
              <Save className="mr-1.5 h-4 w-4" />
              Save Keys
            </Button>
            <Button variant="outline" onClick={handleClear}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

          <Card>
            <CardHeader>
              <CardTitle>Free Tier</CardTitle>
              <CardDescription>
                Signed-in users get 5 free analyses per month without providing any API keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Need more than 5 per month? Add your own API keys above for unlimited use,
                or self-host the{' '}
                <a
                  href="https://github.com/willscott-v2/ontologizer"
                  className="text-blue-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  open-source version
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
