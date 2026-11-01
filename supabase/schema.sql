-- QuizCorner database schema
-- Run this file first in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.creators (
  id text primary key,
  name text not null,
  subject text not null default '',
  topic text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creators_id_format check (id ~ '^creator-[0-9]{2,}$')
);

create table if not exists public.quizzes (
  id text primary key,
  creator_id text not null references public.creators(id) on update cascade on delete restrict,
  title text not null,
  duration_minutes integer not null default 20 check (duration_minutes between 1 and 180),
  question_count integer not null default 20 check (question_count = 20),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Answer keys are stored in this table, not in GitHub JSON files.
-- RLS and grants in policies.sql deny all client roles access.
create table if not exists public.quiz_answer_keys (
  quiz_id text primary key references public.quizzes(id) on update cascade on delete cascade,
  creator_id text not null references public.creators(id) on update cascade on delete restrict,
  answers jsonb not null,
  updated_at timestamptz not null default now(),
  constraint answer_key_is_object check (jsonb_typeof(answers) = 'object')
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  quiz_id text not null references public.quizzes(id) on update cascade on delete restrict,
  creator_id text not null references public.creators(id) on update cascade on delete restrict,
  quiz_title text not null,
  creator_name text not null,
  student_name text not null check (char_length(student_name) between 2 and 60),
  normalized_student_name text not null,
  score integer not null check (score between 0 and 20),
  total_questions integer not null default 20 check (total_questions = 20),
  correct_count integer not null check (correct_count between 0 and 20),
  incorrect_count integer not null check (incorrect_count between 0 and 20),
  unanswered_count integer not null check (unanswered_count between 0 and 20),
  time_taken_seconds integer not null check (time_taken_seconds between 1 and 10800),
  submitted_answers jsonb not null default '{}'::jsonb,
  correct_answers jsonb not null,
  created_at timestamptz not null default now(),
  constraint quiz_attempt_counts_add_up check (correct_count + incorrect_count + unanswered_count = 20),
  constraint attempt_score_matches_correct check (score = correct_count),
  constraint unique_user_idempotency unique (user_id, idempotency_key)
);

-- One public best result per normalised name and quiz. This table contains
-- only fields intended for the public leaderboard, never user_id or answers.
create table if not exists public.leaderboard_best (
  id uuid primary key default gen_random_uuid(),
  quiz_id text not null references public.quizzes(id) on update cascade on delete cascade,
  creator_id text not null references public.creators(id) on update cascade on delete restrict,
  quiz_title text not null,
  creator_name text not null,
  student_name text not null,
  normalized_name text not null,
  score integer not null check (score between 0 and 20),
  total_questions integer not null default 20 check (total_questions = 20),
  time_taken_seconds integer not null check (time_taken_seconds between 1 and 10800),
  updated_at timestamptz not null default now(),
  constraint unique_best_name_per_quiz unique (normalized_name, quiz_id)
);

create index if not exists quiz_attempts_user_quiz_created_idx
  on public.quiz_attempts (user_id, quiz_id, created_at desc);
create index if not exists quiz_attempts_quiz_score_time_idx
  on public.quiz_attempts (quiz_id, score desc, time_taken_seconds asc);
create index if not exists leaderboard_best_quiz_rank_idx
  on public.leaderboard_best (quiz_id, score desc, time_taken_seconds asc, normalized_name asc);
create index if not exists leaderboard_best_overall_rank_idx
  on public.leaderboard_best (score desc, time_taken_seconds asc, normalized_name asc);

-- Update the public best row only when the new result is better.
create or replace function public.upsert_leaderboard_best(
  p_quiz_id text,
  p_creator_id text,
  p_quiz_title text,
  p_creator_name text,
  p_student_name text,
  p_normalized_name text,
  p_score integer,
  p_time_taken_seconds integer
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.leaderboard_best (
    quiz_id, creator_id, quiz_title, creator_name, student_name,
    normalized_name, score, total_questions, time_taken_seconds, updated_at
  ) values (
    p_quiz_id, p_creator_id, p_quiz_title, p_creator_name, p_student_name,
    p_normalized_name, p_score, 20, p_time_taken_seconds, now()
  )
  on conflict (normalized_name, quiz_id) do update set
    creator_id = excluded.creator_id,
    quiz_title = excluded.quiz_title,
    creator_name = excluded.creator_name,
    student_name = excluded.student_name,
    score = excluded.score,
    time_taken_seconds = excluded.time_taken_seconds,
    updated_at = now()
  where excluded.score > public.leaderboard_best.score
     or (excluded.score = public.leaderboard_best.score
         and excluded.time_taken_seconds < public.leaderboard_best.time_taken_seconds);
$$;

-- Return exact public rank positions for one normalised student identity.
-- The RPC is callable only by service_role (see policies.sql).
create or replace function public.get_personal_leaderboard_positions(
  p_scope text,
  p_creator_id text,
  p_normalized_name text
)
returns table (
  quiz_id text,
  creator_id text,
  quiz_title text,
  creator_name text,
  student_name text,
  score integer,
  total_questions integer,
  time_taken_seconds integer,
  rank integer
)
language sql
security invoker
set search_path = public
as $$
  select
    mine.quiz_id,
    mine.creator_id,
    mine.quiz_title,
    mine.creator_name,
    mine.student_name,
    mine.score,
    mine.total_questions,
    mine.time_taken_seconds,
    (
      select count(*)::integer + 1
      from public.leaderboard_best other
      where (p_scope = 'overall' or other.creator_id = p_creator_id)
        and (
          other.score > mine.score
          or (other.score = mine.score and other.time_taken_seconds < mine.time_taken_seconds)
          or (other.score = mine.score and other.time_taken_seconds = mine.time_taken_seconds
              and other.normalized_name < mine.normalized_name)
        )
    ) as rank
  from public.leaderboard_best mine
  where mine.normalized_name = p_normalized_name
    and (p_scope = 'overall' or mine.creator_id = p_creator_id)
    and p_scope in ('overall', 'creator');
$$;

-- Initial seven placeholders. They remain inactive until real question content
-- and matching answer keys have been entered by the site owner.
insert into public.creators (id, name, subject, topic, is_active) values
  ('creator-01', 'Creator 01', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-02', 'Creator 02', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-03', 'Creator 03', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-04', 'Creator 04', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-05', 'Creator 05', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-06', 'Creator 06', 'Subject to be added', 'Quiz topic to be added', true),
  ('creator-07', 'Creator 07', 'Subject to be added', 'Quiz topic to be added', true)
on conflict (id) do nothing;

insert into public.quizzes (id, creator_id, title, duration_minutes, question_count, is_active) values
  ('creator-01', 'creator-01', 'Quiz for Creator 01', 20, 20, false),
  ('creator-02', 'creator-02', 'Quiz for Creator 02', 20, 20, false),
  ('creator-03', 'creator-03', 'Quiz for Creator 03', 20, 20, false),
  ('creator-04', 'creator-04', 'Quiz for Creator 04', 20, 20, false),
  ('creator-05', 'creator-05', 'Quiz for Creator 05', 20, 20, false),
  ('creator-06', 'creator-06', 'Quiz for Creator 06', 20, 20, false),
  ('creator-07', 'creator-07', 'Quiz for Creator 07', 20, 20, false)
on conflict (id) do nothing;

-- NOTE: Do not insert demonstration answer keys. Insert the actual 20-key map
-- after replacing each placeholder quiz JSON, then set quizzes.is_active=true.
