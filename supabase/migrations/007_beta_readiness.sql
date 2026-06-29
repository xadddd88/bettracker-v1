-- 007_beta_readiness.sql
-- Sprint 7 — Beta Readiness: onboarding tracking + in-app beta feedback
-- Apply in Supabase SQL Editor before deploying.

-- ── Onboarding tracking ───────────────────────────────────────
alter table profiles
  add column if not exists onboarding_completed  boolean  not null default false,
  add column if not exists onboarding_stage      text     not null default 'welcome'
    check (onboarding_stage in ('welcome', 'completed'));

-- ── Beta feedback ─────────────────────────────────────────────
create table if not exists beta_feedback (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  rating      smallint    not null check (rating between 1 and 5),
  category    text        not null default 'general'
                          check (category in ('bug', 'suggestion', 'general', 'praise')),
  message     text,
  created_at  timestamptz not null default now()
);

alter table beta_feedback enable row level security;

-- Users can only read and write their own feedback rows.
-- No policy for other roles — admins access via service role.
create policy "beta_feedback_insert"
  on beta_feedback for insert to authenticated
  with check (auth.uid() = user_id);

create policy "beta_feedback_select"
  on beta_feedback for select to authenticated
  using (auth.uid() = user_id);

create index if not exists beta_feedback_user_idx
  on beta_feedback (user_id, created_at desc);
