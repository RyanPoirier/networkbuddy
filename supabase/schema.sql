-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  name text not null default '',
  school text not null default '',
  program text not null default '',
  year text not null default '',
  target_industries text[] not null default '{}',
  target_companies text[] not null default '{}',
  resume_summary text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

-- Contacts table (shared cache)
create table public.contacts (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null default '',
  title text not null default '',
  company text not null default '',
  domain text not null default '',
  email text,
  linkedin_url text,
  email_verified boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index contacts_company_idx on public.contacts (lower(company));
create index contacts_domain_idx on public.contacts (domain);

-- Outreach tracking table
create table public.outreach (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'saved'
    check (status in ('saved','contacted','followed_up','responded','coffee_chat_booked','referral_received')),
  email_sent_at timestamptz,
  followup_due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, contact_id)
);

create index outreach_user_idx on public.outreach (user_id);
create index outreach_status_idx on public.outreach (user_id, status);
create index outreach_followup_idx on public.outreach (followup_due_at) where status = 'contacted';

-- Row-level security
alter table public.users enable row level security;
alter table public.contacts enable row level security;
alter table public.outreach enable row level security;

-- Users: only see/edit your own row
create policy "users_own" on public.users
  for all using (auth.uid() = id);

-- Contacts: any authenticated user can read/insert (shared cache)
create policy "contacts_read" on public.contacts
  for select using (auth.role() = 'authenticated');

create policy "contacts_insert" on public.contacts
  for insert with check (auth.role() = 'authenticated');

create policy "contacts_update" on public.contacts
  for update using (auth.role() = 'authenticated');

-- Outreach: only see/edit your own rows
create policy "outreach_own" on public.outreach
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
