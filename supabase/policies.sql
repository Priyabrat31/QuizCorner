-- QuizCorner access policies and grants
-- Run after schema.sql in Supabase SQL Editor.

alter table public.creators enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_answer_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.leaderboard_best enable row level security;

-- Revoke default client access. Only service_role (used by Edge Functions)
-- can access configuration, answer keys, or raw attempt/history records.
revoke all on table public.creators from public, anon, authenticated;
revoke all on table public.quizzes from public, anon, authenticated;
revoke all on table public.quiz_answer_keys from public, anon, authenticated;
revoke all on table public.quiz_attempts from public, anon, authenticated;
grant all on table public.creators to service_role;
grant all on table public.quizzes to service_role;
grant all on table public.quiz_answer_keys to service_role;
grant all on table public.quiz_attempts to service_role;

-- Explicitly deny client access to private configuration, answer keys and attempts.
-- Service-role Edge Functions bypass RLS and are the only application access path.
do $$
declare t text;
begin
  foreach t in array array['creators','quizzes','quiz_answer_keys','quiz_attempts'] loop
    execute format('drop policy if exists "Deny all client access" on public.%I', t);
    execute format(
      'create policy "Deny all client access" on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end $$;

-- Leaderboard rows are intentionally public. These rows contain only public
-- display fields and a normalised name used for public rank matching.
revoke all on table public.leaderboard_best from public, anon, authenticated;
grant select on table public.leaderboard_best to anon, authenticated;
drop policy if exists "Public can read public best-score rows" on public.leaderboard_best;
create policy "Public can read public best-score rows"
  on public.leaderboard_best
  for select
  to anon, authenticated
  using (true);

-- Edge Functions call this RPC through a service_role client only.
revoke all on function public.upsert_leaderboard_best(text, text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.upsert_leaderboard_best(text, text, text, text, text, text, integer, integer) to service_role;

-- Publish only the public-safe leaderboard table to Realtime.
do $$
begin
  alter publication supabase_realtime add table public.leaderboard_best;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

revoke all on function public.get_personal_leaderboard_positions(text, text, text) from public, anon, authenticated;
grant execute on function public.get_personal_leaderboard_positions(text, text, text) to service_role;

-- Covering indexes for creator foreign keys (also present in the live project).
create index if not exists quizzes_creator_id_idx on public.quizzes (creator_id);
create index if not exists quiz_answer_keys_creator_id_idx on public.quiz_answer_keys (creator_id);
create index if not exists quiz_attempts_creator_id_idx on public.quiz_attempts (creator_id);
create index if not exists leaderboard_best_creator_id_idx on public.leaderboard_best (creator_id);
