-- Ontologizer (Next.js) — fix 'Database error saving new user'
-- Date: 2026-04-14
--
-- The handle_new_user trigger installed by ontologizer-app in Nov 2025
-- inserts (id, email, full_name, avatar_url) into profiles. For magic-link
-- sign-ins the trigger fails on at least one row (exact cause varies:
-- full_name extraction, unique constraint race, or a downstream trigger
-- now missing in our migrated schema), and the failure rolls back the
-- auth.users insert — so the user sees "Database error saving new user"
-- and nothing lands in auth.users.
--
-- This migration:
--   1. Replaces handle_new_user with a version that writes only the fields
--      ontologizer-next requires (id, email, display_name, free tier reset)
--      and explicitly sets free_analyses_reset_at so NOT NULL defaults
--      can't bite.
--   2. Wraps the insert in a BEGIN/EXCEPTION block so a profile insert
--      failure logs a warning but does NOT block auth.users creation.
--      Worst-case outcome: a user exists in auth.users without a profile
--      row, which the app tolerates (metering returns "allowed=false" for
--      missing profiles, prompting BYOK — not a broken signup flow).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    free_analyses_used,
    free_analyses_reset_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name'
    ),
    0,
    date_trunc('month', now()) + interval '1 month'
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'handle_new_user: profile insert failed for %: %',
      new.id, sqlerrm;
    return new;
end;
$$;

-- Trigger already exists from the ontologizer-app schema; re-binding is a
-- no-op if it's still pointing at handle_new_user. Idempotent recreate:
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
