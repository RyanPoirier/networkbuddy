-- Reply tracking: when a contact replies, we stop any pending sends to them and
-- record it so response rate populates on its own.
alter table public.email_queue add column if not exists replied_at timestamptz;

create index if not exists email_queue_reply_check_idx
  on public.email_queue (status, replied_at)
  where status = 'sent';
