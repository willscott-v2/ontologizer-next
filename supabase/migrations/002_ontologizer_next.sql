-- Ontologizer (Next.js) — additive migration onto ontologizer-app schema
-- Date: 2026-04-13
--
-- Adds: free-tier metering columns, encrypted-key columns, analysis_cache,
-- analysis_log, and a new-shape entity_cache keyed by entity_hash.
--
-- Non-destructive of auth data and the `analyses` history table.
-- The existing `entity_cache` (url + content_hash shape from Nov 2024) is
-- renamed to `entity_cache_legacy` so ontologizer-next can own the name.

-- ============================================================================
-- PROFILES — add missing columns for ontologizer-next
-- ============================================================================
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists openai_key_encrypted text,
  add column if not exists google_kg_key_encrypted text,
  add column if not exists gemini_key_encrypted text,
  add column if not exists free_analyses_used int default 0,
  add column if not exists free_analyses_reset_at timestamptz
    default (date_trunc('month', now()) + interval '1 month');

-- Backfill reset_at for any existing rows that predate the column
update public.profiles
set free_analyses_reset_at = date_trunc('month', now()) + interval '1 month'
where free_analyses_reset_at is null;

-- ============================================================================
-- ENTITY_CACHE — rename old, create new (entity-keyed, shared cache)
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entity_cache'
      and column_name = 'content_hash'
  ) then
    execute 'alter table public.entity_cache rename to entity_cache_legacy';
  end if;
end $$;

create table if not exists public.entity_cache (
  id uuid primary key default gen_random_uuid(),
  entity_hash text not null unique,
  entity_name text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists idx_entity_cache_hash on public.entity_cache(entity_hash);
create index if not exists idx_entity_cache_expires on public.entity_cache(expires_at);

-- ============================================================================
-- ANALYSIS_CACHE — short-lived per-URL result cache (1hr TTL)
-- ============================================================================
create table if not exists public.analysis_cache (
  id uuid primary key default gen_random_uuid(),
  url_hash text not null unique,
  url text not null,
  result jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists idx_cache_url_hash on public.analysis_cache(url_hash);
create index if not exists idx_cache_expires on public.analysis_cache(expires_at);

-- ============================================================================
-- ANALYSIS_LOG — usage audit trail for metering + analytics
-- ============================================================================
create table if not exists public.analysis_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  url text,
  analysis_type text not null,
  key_source text not null,
  entities_found int default 0,
  processing_time_ms int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_log_user_month on public.analysis_log(user_id, created_at);

-- ============================================================================
-- RPC — atomic free-tier counter increment
-- ============================================================================
create or replace function public.increment_free_analyses(user_id uuid)
returns void as $$
begin
  update public.profiles
  set free_analyses_used = free_analyses_used + 1
  where id = user_id;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- RLS — policies for new tables (mirrors ontologizer-next/001)
-- ============================================================================
alter table public.entity_cache enable row level security;
drop policy if exists "Entity cache readable by all" on public.entity_cache;
create policy "Entity cache readable by all"
  on public.entity_cache for select using (true);
drop policy if exists "Entity cache writable by authenticated" on public.entity_cache;
create policy "Entity cache writable by authenticated"
  on public.entity_cache for insert with check (auth.role() = 'authenticated');

alter table public.analysis_cache enable row level security;
drop policy if exists "Analysis cache readable by all" on public.analysis_cache;
create policy "Analysis cache readable by all"
  on public.analysis_cache for select using (true);
drop policy if exists "Analysis cache writable by authenticated" on public.analysis_cache;
create policy "Analysis cache writable by authenticated"
  on public.analysis_cache for insert with check (auth.role() = 'authenticated');

alter table public.analysis_log enable row level security;
drop policy if exists "Users see own logs" on public.analysis_log;
create policy "Users see own logs"
  on public.analysis_log for select using (auth.uid() = user_id);
drop policy if exists "System can insert logs" on public.analysis_log;
create policy "System can insert logs"
  on public.analysis_log for insert with check (true);

grant select on public.entity_cache to anon, authenticated;
grant all on public.entity_cache to service_role;
grant select on public.analysis_cache to anon, authenticated;
grant all on public.analysis_cache to service_role;
grant select, insert on public.analysis_log to authenticated;
grant all on public.analysis_log to service_role;
