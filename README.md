# Ontologizer

Extract named entities from webpages, enrich them with structured data from Wikipedia/Wikidata/Knowledge Graph/ProductOntology, generate JSON-LD schema markup, and get SEO recommendations. Includes AI-powered fan-out query analysis via Google Gemini.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase and API keys

# 3. Set up database — run these in your Supabase SQL Editor, in order:
#    - supabase/migrations/001_initial_schema.sql
#    - supabase/migrations/002_ontologizer_next.sql (optional; only if migrating
#      from an older ontologizer-app schema)

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Entity Extraction** - OpenAI GPT-4o identifies named entities (people, orgs, places, products) with regex fallback
- **Multi-Source Enrichment** - Each entity enriched via Wikipedia, Wikidata, Google Knowledge Graph, and ProductOntology in parallel
- **JSON-LD Generation** - Schema.org markup for WebPage, Article, Service, LocalBusiness, EducationalProgram, FAQ, HowTo
- **SEO Recommendations** - AI-powered content optimization suggestions with topical salience scoring
- **Fan-out Analysis** - Gemini 2.5 predicts how Google AI might decompose queries about your content, with per-query coverage scoring
- **LinkedIn resolution** - For person entities, scans the source page for matching LinkedIn profile links
- **BYOK** - Bring your own API keys for unlimited use, or sign up (magic link) for 5 free analyses/month

## Self-Hosting

Clone this repo, set up a [Supabase](https://supabase.com) project (free tier works), and deploy to [Vercel](https://vercel.com) or any Node.js host.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (for caching/metering) |
| `OPENAI_API_KEY` | For free tier | OpenAI key for entity extraction + SEO recs |
| `GOOGLE_KG_API_KEY` | For free tier | Google Knowledge Graph key for enrichment |
| `GEMINI_API_KEY` | For free tier | Google Gemini key for fan-out analysis |

Users who bring their own keys don't consume your API quota.

### Database Setup

Run `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor. This creates:
- User profiles with free-tier metering
- Entity enrichment cache (7-day TTL)
- Analysis result cache (1-hour TTL)
- Usage logging

## Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** + shadcn/ui
- **Supabase** (Auth, Postgres, RLS)
- **cheerio** for HTML parsing
- **OpenAI SDK** + Google Gemini API

## Architecture

The analysis pipeline is split into 4 serverless API routes to stay within Vercel timeout limits:

```
Client (useAnalysis hook)
  │
  ├─ POST /api/analyze/extract    → Fetch URL, parse HTML, extract entities
  ├─ POST /api/analyze/enrich     → Batch enrichment (Wikipedia, Wikidata, KG, ProductOntology)
  ├─ POST /api/analyze/generate   → JSON-LD schema + SEO recommendations + salience score
  └─ POST /api/analyze/fanout     → Gemini fan-out analysis (optional)
```

Entity enrichment runs fully in parallel (not sequential like the original PHP version), dropping enrichment time from ~60-120s to ~5-10s per batch.

## License

MIT
