-- Ontologizer (Next.js) — remove ontologizer-app's email allowlist
-- Date: 2026-04-14
--
-- The shared Supabase project has a `public.check_email_domain()` trigger
-- function enforcing a domain allowlist on auth.users inserts. Ontologizer
-- is a public free tool — no allowlist needed.
--
-- Dropping the function CASCADE sweeps up whatever trigger is bound to it
-- on auth.users. Also drops the backing allowed_emails table.

drop function if exists public.check_email_domain() cascade;
drop table if exists public.allowed_emails cascade;
