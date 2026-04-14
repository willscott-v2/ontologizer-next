'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { sendMagicLink } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await sendMagicLink(email);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  async function handleResend() {
    setResendLoading(true);
    setError('');
    const { error } = await sendMagicLink(email);
    setResendLoading(false);
    if (error) {
      setError(error.message);
    }
  }

  if (sent) {
    return (
      <section className="main-section">
        <div className="si-container">
          <div className="mx-auto max-w-md space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--orange-accent)] hover:text-[var(--orange-light)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to analyzer
            </Link>
            <Card>
              <CardHeader>
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  We sent a sign-in link to <strong>{email}</strong>. Click it
                  to sign in — no password needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600">
                <p>
                  <strong>Not seeing it?</strong> Check your spam folder, or
                  resend the link below.
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resendLoading}
                >
                  {resendLoading ? 'Sending…' : 'Resend link'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="main-section">
      <div className="si-container">
        <div className="mx-auto max-w-md space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--orange-accent)] hover:text-[var(--orange-light)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to analyzer
          </Link>
          <Card>
            <CardHeader>
              <CardTitle>Sign in or sign up</CardTitle>
              <CardDescription>
                Enter your email and we&apos;ll send you a sign-in link. New
                here? We&apos;ll create your account automatically — 5 free
                analyses per month, no password needed. Or{' '}
                <Link href="/settings" className="text-blue-600 hover:underline">
                  add your own API keys
                </Link>{' '}
                to skip the account entirely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending link…' : 'Send sign-in link'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
