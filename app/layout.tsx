import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  GoogleTagManager,
  GoogleTagManagerNoScript,
} from "@/components/layout/GoogleTagManager";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "800"],
  display: "swap",
  variable: "--font-open-sans",
});

const gscVerification = process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION;

export const metadata: Metadata = {
  title: "Ontologizer - Entity Extraction & Structured Data",
  description:
    "Extract named entities from webpages, enrich with Wikipedia/Wikidata/Knowledge Graph, and generate JSON-LD structured data for SEO.",
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
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <head suppressHydrationWarning>
        <GoogleTagManager />
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
