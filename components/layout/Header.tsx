'use client';

import Link from 'next/link';
import { Settings, Code, LogIn, LogOut, User } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Ontologizer
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <Settings className="mr-1.5 h-4 w-4" />
            API Keys
          </Link>

          <a
            href="https://github.com/willscott-v2/ontologizer"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <Code className="mr-1.5 h-4 w-4" />
            Self-Host
          </a>

          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    <User className="mr-1 inline h-3.5 w-3.5" />
                    {user.email?.split('@')[0]}
                  </span>
                  <Button variant="ghost" size="sm" onClick={signOut}>
                    <LogOut className="mr-1 h-3.5 w-3.5" />
                    Sign out
                  </Button>
                </div>
              ) : (
                <Link
                  href="/auth/login"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Sign in
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
