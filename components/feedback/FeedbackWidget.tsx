'use client';

import { useState } from 'react';
import { MessageSquare, X, Check, Loader2 } from 'lucide-react';

type FeedbackType = 'bug' | 'feature' | 'improvement' | 'other';

const TYPES: Array<{ value: FeedbackType; label: string; icon: string }> = [
  { value: 'bug', label: 'Bug Report', icon: '🐛' },
  { value: 'feature', label: 'Feature Request', icon: '✨' },
  { value: 'improvement', label: 'Improvement', icon: '💡' },
  { value: 'other', label: 'Other', icon: '💬' },
];

function placeholderFor(type: FeedbackType): string {
  switch (type) {
    case 'bug':
      return 'What went wrong, and how can we reproduce it?';
    case 'feature':
      return 'What would you like Ontologizer to do?';
    case 'improvement':
      return 'What part of Ontologizer should work better?';
    default:
      return 'Share your thoughts...';
  }
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>('improvement');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          pageUrl:
            typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(onClose, 1800);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to submit feedback');
      }
    } catch {
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-xl bg-[var(--si-slate)] p-6 text-white shadow-2xl border border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition"
          aria-label="Close feedback"
        >
          <X className="size-4" />
        </button>

        <h3
          id="feedback-title"
          className="flex items-center gap-2 text-lg font-extrabold"
        >
          <MessageSquare className="size-5 text-[var(--orange-accent)]" />
          Send feedback
        </h3>

        {submitted ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--si-green)]/20 text-[var(--si-green)]">
              <Check className="size-7" />
            </div>
            <p className="mt-4 font-semibold">Thank you!</p>
            <p className="mt-1 text-sm text-white/70">
              Your feedback helps us improve Ontologizer.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/70 mb-2">
                Type of feedback
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      type === t.value
                        ? 'bg-[var(--orange-accent)] text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/15'
                    }`}
                  >
                    <span className="mr-1.5">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="feedback-message"
                className="block text-xs font-semibold uppercase tracking-wide text-white/70 mb-2"
              >
                Your feedback
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholderFor(type)}
                rows={5}
                required
                className="w-full resize-none rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/40 focus:border-[var(--orange-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--orange-accent)]/30"
              />
            </div>

            {error && (
              <p className="text-sm text-red-300">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--orange-accent)] px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-white transition hover:bg-[var(--orange-dark)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  'Send feedback'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--orange-accent)] px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg transition hover:scale-105 hover:bg-[var(--orange-dark)] active:scale-95"
        aria-label="Send feedback"
      >
        <MessageSquare className="size-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
