-- Ontologizer schema
-- Run this in Supabase SQL Editor to set up the database

-- Extends Supabase Auth users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  openai_key_encrypted text,
  google_kg_key_encrypted text,
  gemini_key_encrypted text,
  free_analyses_used int default 0,
  free_analyses_reset_at timestamptz default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Analysis cache (replaces WordPress Transients)
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

-- Entity enrichment cache (shared across users, 7-day TTL)
create table if not exists public.entity_cache (
  id uuid primary key default gen_random_uuid(),
  entity_hash text not null unique,
  entity_name text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null
);
create index if not exists idx_entity_cache_hash on public.entity_cache(entity_hash);

-- Usage log for metering and analytics
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

-- Row Level Security
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

alter table public.analysis_cache enable row level security;
create policy "Cache readable by all" on public.analysis_cache for select using (true);
create policy "Cache writable by authenticated" on public.analysis_cache for insert with check (auth.role() = 'authenticated');

alter table public.entity_cache enable row level security;
create policy "Entity cache readable by all" on public.entity_cache for select using (true);
create policy "Entity cache writable by authenticated" on public.entity_cache for insert with check (auth.role() = 'authenticated');

alter table public.analysis_log enable row level security;
create policy "Users see own logs" on public.analysis_log for select using (auth.uid() = user_id);
create policy "System can insert logs" on public.analysis_log for insert with check (true);

-- Cleanup expired cache entries (run via pg_cron or scheduled function)
-- select cron.schedule('cleanup-expired-cache', '0 3 * * *', $$
--   delete from public.analysis_cache where expires_at < now();
--   delete from public.entity_cache where expires_at < now();
-- $$);
