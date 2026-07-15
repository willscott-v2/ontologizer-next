import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  GoogleTagManager,
  GoogleTagManagerNoScript,
} from "@/components/layout/GoogleTagManager";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import "./globals.css";

const openSans = localFont({
  src: "./fonts/open-sans-latin.woff2",
  weight: "300 800",
  style: "normal",
  display: "swap",
  variable: "--font-open-sans",
  fallback: ["Arial", "sans-serif"],
});

const gscVerification = process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ontologizer.searchinfluence.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Free AI Content Clarity & Schema Analyzer | Ontologizer",
  description:
    "Analyze one page for topic focus, entity clarity, semantic coherence, answer structure, and connected JSON-LD schema. Free from Search Influence.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Ontologizer by Search Influence",
    title: "Free AI Content Clarity & Schema Analyzer",
    description:
      "See whether one page clearly explains its topic, supports related entities, answers likely questions, and has safe connected schema.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Content Clarity & Schema Analyzer",
    description:
      "Evidence-backed clarity checks, modeled query coverage, and connected JSON-LD for one page.",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  ...(gscVerification && {
    verification: { google: gscVerification },
  }),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const applicationSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Ontologizer",
    url: siteUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "A free single-page analyzer for AI content clarity, entity review, modeled query coverage, and connected schema markup.",
    provider: {
      "@type": "Organization",
      name: "Search Influence",
      url: "https://www.searchinfluence.com/",
    },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <head suppressHydrationWarning>
        <GoogleTagManager />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(applicationSchema).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <GoogleTagManagerNoScript />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FeedbackWidget />
        <Toaster />
      </body>
    </html>
  );
}
