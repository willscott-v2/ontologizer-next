# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ontologizer is a standalone Next.js web app that extracts named entities from webpages, enriches them with structured data from Wikipedia/Wikidata/Google Knowledge Graph/ProductOntology, generates JSON-LD schema markup, and provides SEO recommendations. Includes optional Gemini-powered fan-out query analysis.

Ported from a WordPress plugin (PHP) to a standalone TypeScript app deployable on Vercel.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (also runs TypeScript check)
npm run lint         # ESLint
```

No test framework yet. Manual testing via the dev server.

## Architecture

### Client-Orchestrated Pipeline

The analysis pipeline is split into 4 API routes to work within Vercel's serverless timeout limits. The client calls them sequentially:

1. `POST /api/analyze/extract` - Fetch URL, parse HTML (cheerio), extract entities (OpenAI)
2. `POST /api/analyze/enrich` - Enrich a batch of 4-6 entities in parallel (Wikipedia, Wikidata, Google KG, ProductOntology)
3. `POST /api/analyze/generate` - Generate JSON-LD schema, SEO recommendations, salience score
4. `POST /api/analyze/fanout` - Gemini fan-out query analysis (optional)

The `useAnalysis` hook (not yet built) orchestrates these calls as a state machine.

### BYOK (Bring Your Own Keys)

Users can provide their own API keys via the Settings page. Keys are stored in `localStorage` and sent per-request in headers (`X-OpenAI-Key`, `X-Google-KG-Key`, `X-Gemini-Key`). API routes check these headers first, falling back to server env vars for free-tier users.

Anonymous users can use the tool with BYOK (no signup required). Registered users get 5 free analyses/month using the app's API keys.

### Key Directories

- `lib/pipeline/` - Core processing logic (fetcher, parser, entity extraction, enrichment, schema generation, analysis)
- `lib/supabase/` - Supabase client/server/middleware helpers
- `lib/types/` - TypeScript type definitions for the analysis pipeline
- `hooks/` - React hooks (useApiKeys, useAuth, useAnalysis)
- `components/analyzer/` - Analysis UI components (form, results tabs, progress)
- `supabase/migrations/` - SQL schema for Supabase (profiles, cache, usage log)

### External APIs

| API | Header | Purpose |
|-----|--------|---------|
| OpenAI (gpt-4o) | `X-OpenAI-Key` | Entity extraction, SEO recommendations |
| Google Gemini 2.0 | `X-Gemini-Key` | Fan-out query analysis |
| Google Knowledge Graph | `X-Google-KG-Key` | Entity enrichment |
| Wikipedia | (none) | Entity validation and URLs |
| Wikidata | (none) | Semantic identifiers |
| ProductOntology | (none) | Product entity classification |

### Supabase Schema

- `profiles` - Extends auth.users with free tier metering and optional encrypted API keys
- `analysis_cache` - Full analysis results keyed by URL hash (1hr TTL)
- `entity_cache` - Per-entity enrichment data (7-day TTL, shared across users)
- `analysis_log` - Usage tracking for metering and analytics
