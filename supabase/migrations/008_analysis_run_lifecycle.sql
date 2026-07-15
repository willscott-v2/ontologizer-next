-- Migration 008: make analysis_log a server-owned lifecycle record.

alter table public.analysis_log
  add column if not exists content_hash text,
  add column if not exists analysis_version text,
  add column if not exists completed_steps text[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_analysis_log_active_run
  on public.analysis_log(id, user_id, expires_at)
  where status = 'in_progress';

drop policy if exists "System can insert logs" on public.analysis_log;
revoke all privileges on public.analysis_log from anon, authenticated;
grant select on public.analysis_log to authenticated;
grant all on public.analysis_log to service_role;
