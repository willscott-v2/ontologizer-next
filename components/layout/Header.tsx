'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Settings, LogIn, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const { user, loading, signOut } = useAuth();

  return (
    <header className="site-header">
      <div className="si-container">
        <div className="site-nav">
          <Link href="/" className="product-brand" aria-label="Ontologizer home">
            <span className="product-brand-logo">
              <Image
                src="/search-influence-logo.png"
                alt="Search Influence"
                width={112}
                height={24}
                priority
              />
            </span>
            <span className="product-brand-name">Ontologizer</span>
          </Link>

          <nav aria-label="Utility navigation" className="site-nav-links">
            <Link href="/#how-it-works" className="site-nav-link">
              How it works
            </Link>
            <Link
              href="/settings"
              className="site-nav-link"
            >
              <Settings className="h-4 w-4" />
              API Keys
            </Link>

            {!loading && (
              <>
                {user ? (
                  <div className="site-account">
                    <span className="header-user">
                      <User className="h-3.5 w-3.5" />
                      {user.email?.split('@')[0]}
                    </span>
                    <button
                      type="button"
                      onClick={signOut}
                      className="site-nav-link"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/auth/login"
                    className="site-nav-cta"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign in / up
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
