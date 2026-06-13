-- Migration: private contacts + interactions timeline + LinkedIn connection state
-- Safe to run once. Clears existing shared contacts (they were cache rows).

-- 1. Make contacts private per-user --------------------------------------------

-- Remove old shared-cache rows so we can enforce ownership cleanly
delete from public.outreach;
delete from public.contacts;

alter table public.contacts
  add column user_id uuid not null references public.users(id) on delete cascade;

create index contacts_user_idx on public.contacts (user_id);

-- Replace shared-cache policies with per-user policies
drop policy if exists "contacts_read" on public.contacts;
drop policy if exists "contacts_insert" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;

create policy "contacts_own" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. LinkedIn connection state on the pipeline record --------------------------

alter table public.outreach
  add column linkedin_connection_status text not null default 'none'
    check (linkedin_connection_status in ('none','pending','connected')),
  add column connection_requested_at timestamptz;

-- 3. Interactions timeline -----------------------------------------------------

create table public.interactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  outreach_id uuid not null references public.outreach(id) on delete cascade,
  type text not null
    check (type in (
      'connection_sent','connection_accepted',
      'linkedin_message','email_sent','reply_received','note'
    )),
  channel text not null default 'linkedin'
    check (channel in ('linkedin','email')),
  content text,
  created_at timestamptz not null default now()
);

create index interactions_outreach_idx on public.interactions (outreach_id, created_at);
create index interactions_user_idx on public.interactions (user_id);

alter table public.interactions enable row level security;

create policy "interactions_own" on public.interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
