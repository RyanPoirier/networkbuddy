-- Per-user reveal quota (freemium). Users can READ their usage (to show a
-- counter) but only the service role can WRITE it — so nobody can reset their
-- own count from the browser.
create table public.usage (
  user_id uuid primary key references public.users(id) on delete cascade,
  plan text not null default 'free',
  reveals_used int not null default 0,
  period text not null default '',        -- current billing month, e.g. "2026-07"
  updated_at timestamptz not null default now()
);

alter table public.usage enable row level security;

-- Read-only for the owner; no insert/update policy = users can't modify it.
create policy "usage_read_own" on public.usage
  for select using (auth.uid() = user_id);
