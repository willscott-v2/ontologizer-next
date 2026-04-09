# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ontologizer is a standalone Next.js web app that extracts named entities from webpages, enriches them with structured data from Wikipedia/Wikidata/Google Knowledge Graph/ProductOntology, generates JSON-LD schema markup, and provides SEO recommendations. Includes optional Gemini-powered fan-out query analysis.

Ported from a WordPress plugin (PHP, in the sibling `ontologizer/` directory) to a standalone TypeScript app deployable on Vercel. The WP plugin is being deprecated in favor of this app.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build (also runs TypeScript check)
npm run lint         # ESLint
```

No test framework yet. Manual testing via the dev server.

## Setup

1. Create a Supabase project
2. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in Supabase URL/keys + API keys
4. `npm install && npm run dev`

## Architecture

### Client-Orchestrated Pipeline

The analysis pipeline is split into 4 API routes to work within Vercel's serverless timeout limits. The `useAnalysis` hook in `hooks/useAnalysis.ts` orchestrates these as a state machine, calling them sequentially:

1. `POST /api/analyze/extract` - Fetch URL, parse HTML (cheerio), extract entities (OpenAI GPT-4o with regex fallback). Checks free-tier metering for non-BYOK users.
2. `POST /api/analyze/enrich` - Enrich a batch of 5 entities in parallel (Wikipedia, Wikidata, Google KG, ProductOntology). Checks entity cache first, writes back after enrichment.
3. `POST /api/analyze/generate` - Generate JSON-LD schema, SEO recommendations (OpenAI), salience score
4. `POST /api/analyze/fanout` - Gemini 2.0 fan-out query analysis (optional)

The client calls `/extract` once, then `/enrich` 2-4 times (batches of 5), then `/generate`, then optionally `/fanout`. Each call targets <10s wall-clock.

### BYOK (Bring Your Own Keys)

Users provide API keys via the Settings page (`/settings`). Keys are stored in `localStorage` via `hooks/useApiKeys.ts` and sent per-request in headers (`X-OpenAI-Key`, `X-Google-KG-Key`, `X-Gemini-Key`). API routes check these headers first, falling back to server env vars for free-tier users.

- **Anonymous users**: BYOK only, no signup required
- **Registered users**: 5 free analyses/month using app's API keys, unlimited with BYOK
- **Free tier metering**: `lib/metering/usage-tracker.ts` checks/increments `profiles.free_analyses_used`

### Key Directories

- `lib/pipeline/` - Core processing (fetcher, parser, entity extraction, enrichment, schema generation, analysis, fan-out)
- `lib/pipeline/enricher/` - 5 modules: wikipedia.ts, wikidata.ts, google-kg.ts, product-ontology.ts, index.ts (parallel orchestrator)
- `lib/pipeline/schema-generator/` - 7 modules: index.ts (dispatcher), webpage.ts, article.ts, service.ts, local-business.ts, educational.ts, additional.ts (FAQ/HowTo/Author/Org)
- `lib/cache/` - Supabase-backed entity cache (7-day TTL) and analysis cache (1hr TTL)
- `lib/metering/` - Free tier usage tracking and analysis logging
- `lib/supabase/` - Supabase client/server/middleware helpers
- `lib/types/` - TypeScript types: `analysis.ts` (TextParts, ExtractResult, EnrichResult, GenerateResult, FanoutResult, AnalysisResult, AnalyzeParams) and `entities.ts` (RawEntity, EnrichedEntity, EntityType)
- `hooks/` - useAnalysis (pipeline state machine), useApiKeys (localStorage BYOK), useAuth (Supabase auth)
- `components/analyzer/` - AnalyzerForm, ProgressIndicator, ResultsTabs, EntitiesTab, JsonLdTab, RecommendationsTab, FanoutTab, SalienceScore

### External APIs

| API | Header | Purpose |
|-----|--------|---------|
| OpenAI (gpt-4o) | `X-OpenAI-Key` | Entity extraction, SEO recommendations |
| Google Gemini 2.0 | `X-Gemini-Key` | Fan-out query analysis |
| Google Knowledge Graph | `X-Google-KG-Key` | Entity enrichment |
| Wikipedia | (none) | Entity validation and URLs |
| Wikidata | (none) | Semantic identifiers |
| ProductOntology | (none) | Product entity classification |

### Supabase Schema (in `supabase/migrations/001_initial_schema.sql`)

- `profiles` - Extends auth.users with free tier metering (`free_analyses_used`, `free_analyses_reset_at`) and optional encrypted API keys
- `entity_cache` - Per-entity enrichment data keyed by MD5 hash (7-day TTL, shared across users)
- `analysis_cache` - Full analysis results keyed by URL hash (1hr TTL)
- `analysis_log` - Usage tracking for metering and analytics
- `increment_free_analyses()` - RPC function for atomic counter increment

### Type Conventions

The `TextParts` interface uses: `title`, `description`, `headings` (with `level` and `text`), `body`, `htmlContent`. The `EntityType` union uses PascalCase values ('Person', 'Organization', 'Place', etc.).

### What's Still TODO

- End-to-end testing with real URLs and Supabase connected
- Responsive design polish
- Analysis history page for logged-in users
- Saved API keys (encrypted in Supabase profile, currently localStorage only)
- Vercel deployment + environment variable setup
