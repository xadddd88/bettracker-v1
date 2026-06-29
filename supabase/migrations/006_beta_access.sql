-- 006_beta_access.sql
-- Closed beta email allowlist.
-- Apply in Supabase SQL Editor, then disable public email signup in
-- Authentication → Providers → Email → "Enable email signups" → OFF

create table if not exists beta_access (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null,
  email_normalized  text        not null unique,
  status            text        not null default 'approved'
                                check (status in ('approved', 'used', 'revoked')),
  used_at           timestamptz,
  used_by_user_id   uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists beta_access_status_idx
  on beta_access (status);

alter table beta_access enable row level security;

-- No SELECT / INSERT / UPDATE / DELETE policies for anon or authenticated roles.
-- All reads and writes go through the service role client in /api/auth/register.
