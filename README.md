# Ontologizer

Analyze a webpage or pasted content for topic focus, entity clarity, semantic coherence, and answer structure. Ontologizer also creates a connected JSON-LD artifact, evidence-backed recommendations, and optional modeled AI Query Coverage.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase and API keys

# 3. Set up the database by applying supabase/migrations/001 through 008 in order.

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **AI Content Clarity** - Evidence-backed Topic Focus, Entity Clarity, Semantic Coherence, and Answer Structure findings without an unexplained aggregate score
- **Entity Extraction and Enrichment** - Named entities with contextual Wikipedia, Wikidata, and Knowledge Graph references when verified
- **Connected JSON-LD** - A linked Schema.org `@graph` with page-type evidence, validation findings, and Ready, Review, or Insufficient status
- **Recommendations** - Prioritized actions tied to visible page evidence
- **AI Query Coverage** - Optional modeled adjacent questions and page-coverage checks; this is not observed Google or Search Console query data
- **Branded Markdown Export** - Ungated report with source, timestamp, version, confidence, schema, and Search Influence attribution
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
| `GEMINI_API_KEY` | For free tier | Google Gemini key for optional AI Query Coverage |

Users who bring their own keys don't consume your API quota.

### Database Setup

Apply every migration in `supabase/migrations` in numeric order. These create and update:
- User profiles with free-tier metering
- Entity enrichment cache (7-day TTL)
- Server-owned analysis-run lifecycle and step authorization
- Usage, status, token, and cost logging

## Reusable Components

- **[Feedback Widget](docs/feedback-widget.md)** — drop-in "Send feedback" button that posts to Slack via an incoming webhook. Designed to be copy-pasted into any Next.js App Router project; one shared webhook serves many projects via the `FEEDBACK_PROJECT_NAME` env var.

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
  ├─ POST /api/analyze/generate   → Clarity, connected schema, and recommendations
  └─ POST /api/analyze/fanout     → Modeled AI Query Coverage (optional)
```

The public full-result cache routes are intentionally absent. Server-owned derived caches remain versioned, while each downstream provider step is authorized against an expiring analysis run.

## License

MIT
