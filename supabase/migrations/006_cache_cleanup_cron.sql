-- Migration: 006_cache_cleanup_cron.sql
-- Purpose: Automatic cleanup of expired cache rows across all cache tables.
--
-- Strategy:
--   1. Define public.clean_expired_caches() that DELETEs expired rows from
--      every known cache table (guarded with to_regclass checks so missing
--      tables don't hard-fail the function).
--   2. If pg_cron is available on this Supabase project, schedule the
--      function to run daily at 03:00 UTC. Otherwise, emit a notice so the
--      operator knows to invoke it manually or via an Edge Function.
--
-- Idempotency:
--   - create extension if not exists
--   - create or replace function
--   - cron.schedule() overwrites an existing job of the same name
--
-- Note: pg_cron on Supabase typically requires the Pro plan (or higher) and
-- must be enabled from Dashboard -> Database -> Extensions -> pg_cron. If
-- the extension isn't available, the function still works and can be called
-- manually: `select public.clean_expired_caches();`

------------------------------------------------------------------------------
-- 1. Define the cleanup function
------------------------------------------------------------------------------
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.clean_expired_caches()
  RETURNS integer[]
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    deleted_entity     integer := 0;
    deleted_analysis   integer := 0;
    deleted_url        integer := 0;
    deleted_extraction integer := 0;
    deleted_fanout     integer := 0;
  BEGIN
    IF to_regclass('public.entity_cache') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.entity_cache WHERE expires_at < now()';
      GET DIAGNOSTICS deleted_entity = ROW_COUNT;
      RAISE NOTICE 'clean_expired_caches: deleted % row(s) from entity_cache', deleted_entity;
    ELSE
      RAISE NOTICE 'clean_expired_caches: entity_cache does not exist, skipping';
    END IF;

    IF to_regclass('public.analysis_cache') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.analysis_cache WHERE expires_at < now()';
      GET DIAGNOSTICS deleted_analysis = ROW_COUNT;
      RAISE NOTICE 'clean_expired_caches: deleted % row(s) from analysis_cache', deleted_analysis;
    ELSE
      RAISE NOTICE 'clean_expired_caches: analysis_cache does not exist, skipping';
    END IF;

    IF to_regclass('public.url_cache') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.url_cache WHERE expires_at < now()';
      GET DIAGNOSTICS deleted_url = ROW_COUNT;
      RAISE NOTICE 'clean_expired_caches: deleted % row(s) from url_cache', deleted_url;
    ELSE
      RAISE NOTICE 'clean_expired_caches: url_cache does not exist, skipping';
    END IF;

    IF to_regclass('public.extraction_cache') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.extraction_cache WHERE expires_at < now()';
      GET DIAGNOSTICS deleted_extraction = ROW_COUNT;
      RAISE NOTICE 'clean_expired_caches: deleted % row(s) from extraction_cache', deleted_extraction;
    ELSE
      RAISE NOTICE 'clean_expired_caches: extraction_cache does not exist, skipping';
    END IF;

    IF to_regclass('public.fanout_cache') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.fanout_cache WHERE expires_at < now()';
      GET DIAGNOSTICS deleted_fanout = ROW_COUNT;
      RAISE NOTICE 'clean_expired_caches: deleted % row(s) from fanout_cache', deleted_fanout;
    ELSE
      RAISE NOTICE 'clean_expired_caches: fanout_cache does not exist, skipping';
    END IF;

    RETURN ARRAY[
      deleted_entity,
      deleted_analysis,
      deleted_url,
      deleted_extraction,
      deleted_fanout
    ];
  END;
  $fn$;

  RAISE NOTICE 'Created/replaced function public.clean_expired_caches()';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Failed to create public.clean_expired_caches(): % (%)', SQLERRM, SQLSTATE;
END
$$;

------------------------------------------------------------------------------
-- 2. Enable pg_cron and schedule the daily cleanup
------------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  RAISE NOTICE 'pg_cron extension is available';

  -- Schedule cleanup daily at 03:00 UTC. cron.schedule() is idempotent by
  -- job name: re-running this migration updates the schedule in place.
  PERFORM cron.schedule(
    'cleanup-expired-caches',
    '0 3 * * *',
    'SELECT public.clean_expired_caches();'
  );
  RAISE NOTICE 'Scheduled cron job "cleanup-expired-caches" to run daily at 03:00 UTC';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or scheduling failed: % (%)', SQLERRM, SQLSTATE;
  RAISE NOTICE 'Falling back to manual invocation. Run `select public.clean_expired_caches();` on a schedule via Supabase Edge Functions, an external cron service, or enable pg_cron from the Supabase Dashboard -> Database -> Extensions.';
END
$$;
