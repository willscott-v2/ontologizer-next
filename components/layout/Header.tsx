'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Settings, Code, LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="si-header">
      <div className="si-container">
        <div className="header-top flex items-center justify-between mb-8">
          <a
            href="https://www.searchinfluence.com"
            target="_blank"
            rel="noopener noreferrer"
            className="logo-container"
          >
            <Image
              src="/search-influence-logo.png"
              alt="Search Influence"
              width={140}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </a>

          <nav aria-label="Utility navigation" className="header-nav flex items-center gap-3 text-white/90 text-sm">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <Settings className="h-4 w-4" />
              API Keys
            </Link>

            <a
              href="https://github.com/willscott-v2/ontologizer"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <Code className="h-4 w-4" />
              Self-Host
            </a>

            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-2">
                    <span className="header-user inline-flex items-center gap-1 text-white/80">
                      <User className="h-3.5 w-3.5" />
                      {user.email?.split('@')[0]}
                    </span>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/20 hover:bg-white/10 transition-colors"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign in / up
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="header-content">
          <div className="logo-section">
            <h1>Ontologizer: AI Content Clarity Analyzer</h1>
            <p className="tagline">See what your page communicates clearly, and what needs work.</p>
            <p className="header-description">
              Review topic focus, entity clarity, semantic coherence, answer
              structure, and connected JSON-LD in one evidence-backed report.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
