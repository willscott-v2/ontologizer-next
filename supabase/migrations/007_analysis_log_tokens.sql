-- Migration 007: token/cost tracking, failure logging, and content capture
-- on analysis_log.
--
-- Token + cost columns: per-provider tokens and USD cost per run, computed
-- from lib/pricing.ts at log time. numeric(10,6) gives 6 decimal places for
-- sub-cent precision on individual calls.
--
-- Failure logging: status ('complete' | 'failed') with the pipeline step
-- and error message that killed the run. Previously only successful runs
-- were logged.
--
-- Content capture: full combined AnalysisResult (entities, JSON-LD,
-- recommendations, salience, fan-out) as jsonb — including BYOK runs — so
-- run outputs can be studied. Raw page HTML is NOT included (the
-- AnalysisResult shape doesn't carry it).

alter table public.analysis_log
  add column if not exists status text not null default 'complete',
  add column if not exists error_step text,
  add column if not exists error_message text,
  add column if not exists result jsonb,
  add column if not exists openai_input_tokens int default 0,
  add column if not exists openai_output_tokens int default 0,
  add column if not exists openai_cost_usd numeric(10,6) default 0,
  add column if not exists gemini_input_tokens int default 0,
  add column if not exists gemini_output_tokens int default 0,
  add column if not exists gemini_cost_usd numeric(10,6) default 0,
  add column if not exists total_cost_usd numeric(10,6) default 0;

create index if not exists idx_log_cost_month
  on public.analysis_log(created_at, total_cost_usd);

create index if not exists idx_log_status
  on public.analysis_log(status)
  where status <> 'complete';
