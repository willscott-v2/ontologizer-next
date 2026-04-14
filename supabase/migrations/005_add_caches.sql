-- Ontologizer (Next.js) — cache expansion migration
-- Date: 2026-04-13
--
-- Adds extraction_cache (content-hash keyed, 24hr TTL) and fanout_cache
-- (content-hash keyed, 1hr TTL). url_cache and analysis_cache already
-- exist in the shared Supabase project; entity_cache is untouched.
--
-- pg_cron cleanup is handled in migration 006.

-- ============================================================================
-- EXTRACTION_CACHE — OpenAI entity-extraction result cache (24hr TTL)
-- ============================================================================
create table if not exists public.extraction_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  data jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists idx_extraction_cache_hash on public.extraction_cache(content_hash);
create index if not exists idx_extraction_cache_expires on public.extraction_cache(expires_at);

alter table public.extraction_cache enable row level security;
drop policy if exists "Extraction cache readable by all" on public.extraction_cache;
create policy "Extraction cache readable by all"
  on public.extraction_cache for select using (true);
drop policy if exists "Extraction cache writable by service" on public.extraction_cache;
create policy "Extraction cache writable by service"
  on public.extraction_cache for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

grant select on public.extraction_cache to anon, authenticated;
grant all on public.extraction_cache to service_role;

-- ============================================================================
-- FANOUT_CACHE — Gemini fan-out result cache (1hr TTL)
-- ============================================================================
create table if not exists public.fanout_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  result jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists idx_fanout_cache_hash on public.fanout_cache(content_hash);
create index if not exists idx_fanout_cache_expires on public.fanout_cache(expires_at);

alter table public.fanout_cache enable row level security;
drop policy if exists "Fanout cache readable by all" on public.fanout_cache;
create policy "Fanout cache readable by all"
  on public.fanout_cache for select using (true);
drop policy if exists "Fanout cache writable by service" on public.fanout_cache;
create policy "Fanout cache writable by service"
  on public.fanout_cache for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

grant select on public.fanout_cache to anon, authenticated;
grant all on public.fanout_cache to service_role;
