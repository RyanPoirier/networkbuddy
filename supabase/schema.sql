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

-- Contacts table (private per user)
create table public.contacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
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

create index contacts_user_idx on public.contacts (user_id);
create index contacts_company_idx on public.contacts (lower(company));
create index contacts_domain_idx on public.contacts (domain);

-- Outreach tracking table
create table public.outreach (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'saved'
    check (status in ('saved','contacted','followed_up','responded','coffee_chat_booked','referral_received')),
  linkedin_connection_status text not null default 'none'
    check (linkedin_connection_status in ('none','pending','connected')),
  connection_requested_at timestamptz,
  email_sent_at timestamptz,
  followup_due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, contact_id)
);

create index outreach_user_idx on public.outreach (user_id);
create index outreach_status_idx on public.outreach (user_id, status);
create index outreach_followup_idx on public.outreach (followup_due_at) where status = 'contacted';

-- Interactions timeline (every outreach action logged as an event)
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

-- Row-level security
alter table public.users enable row level security;
alter table public.contacts enable row level security;
alter table public.outreach enable row level security;
alter table public.interactions enable row level security;

-- Users: only see/edit your own row
create policy "users_own" on public.users
  for all using (auth.uid() = id);

-- Contacts: only see/edit your own rows (private per user)
create policy "contacts_own" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Outreach: only see/edit your own rows
create policy "outreach_own" on public.outreach
  for all using (auth.uid() = user_id);

-- Interactions: only see/edit your own rows
create policy "interactions_own" on public.interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
