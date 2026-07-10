-- Automated personalized drip-send: Gmail connection + a throttled send queue.

-- One connected Gmail per user. Tokens are service-role only (never exposed to
-- the browser). NOTE: for CASA/production hardening, encrypt refresh_token at
-- the app layer before storing — fine as-is for a <100-user pilot.
create table public.gmail_accounts (
  user_id uuid primary key references public.users(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  access_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.gmail_accounts enable row level security;
-- Owner may see IF they're connected (email only is safe); tokens are read via
-- the service role in server code, never through this policy.
create policy "gmail_read_own" on public.gmail_accounts
  for select using (auth.uid() = user_id);

-- The drip queue. Messages are pre-approved by the student, then sent a few per
-- day from their own mailbox.
create table public.email_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  -- queued -> sent | failed | stopped (stopped = sequence halted, e.g. on reply)
  status text not null default 'queued',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  created_at timestamptz not null default now()
);
alter table public.email_queue enable row level security;
create policy "queue_read_own" on public.email_queue
  for select using (auth.uid() = user_id);

create index email_queue_due_idx on public.email_queue (status, scheduled_for);
create index email_queue_user_idx on public.email_queue (user_id, status);
