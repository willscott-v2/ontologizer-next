'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { sendMagicLink, verifyOtp } = useAuth();

  const initialError = searchParams.get('error') === 'auth'
    ? 'That sign-in link was invalid or already used. Enter your email below and we\u2019ll send a fresh 6-digit code.'
    : '';

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

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    const { error } = await verifyOtp(email, code);
    setVerifying(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
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
                  We sent a 6-digit sign-in code to <strong>{email}</strong>.
                  Enter it below to sign in — no password needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">6-digit code</Label>
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      required
                      autoFocus
                    />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={verifying || code.length !== 6}
                  >
                    {verifying ? 'Verifying…' : 'Sign in'}
                  </Button>
                </form>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    <strong>Not seeing it?</strong> Check your spam folder, or
                    resend the code below.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResend}
                    disabled={resendLoading}
                  >
                    {resendLoading ? 'Sending…' : 'Resend code'}
                  </Button>
                </div>
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
                Enter your email and we&apos;ll send you a 6-digit sign-in
                code. New here? We&apos;ll create your account automatically —
                5 free analyses per month, no password needed. Or{' '}
                <Link href="/settings" className="text-blue-600 hover:underline">
                  add your own API keys
                </Link>{' '}
                to skip the account entirely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {initialError && (
                <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  {initialError}
                </p>
              )}
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
                  {loading ? 'Sending code…' : 'Send sign-in code'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
