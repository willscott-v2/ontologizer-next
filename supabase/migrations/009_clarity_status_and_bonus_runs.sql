-- Migration 009: per-run clarity statuses + promotional bonus runs.
--
-- clarity_status: the four dimension statuses from the clarity assessment
-- ({"topicFocus":"mixed","entityClarity":"strong",...}), written server-side
-- by the generate step. Statuses only — the full assessment stays in the
-- GenerateResult payload and is not persisted.
--
-- bonus_analyses: one-time promotional credits granted per user by an
-- operator. Consumed only after the monthly 5 free runs are used; does not
-- reset monthly.

alter table public.analysis_log
  add column if not exists clarity_status jsonb;

alter table public.profiles
  add column if not exists bonus_analyses int not null default 0;
