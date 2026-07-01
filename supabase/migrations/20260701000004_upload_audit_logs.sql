-- Migration: 20260701000004_upload_audit_logs.sql
-- Create upload_audit_logs table with RLS and add delete_user_data RPC.

create table if not exists public.upload_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  upload_id text,
  filename text,
  report_type text,
  project_id text,
  source_tool text,
  row_count integer,
  cleaned_row_count integer,
  duplicates_removed integer,
  dedupe_rate numeric,
  dedupe_report_id text,
  event_type text default 'import',
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

-- Enable RLS
alter table public.upload_audit_logs enable row level security;

-- RLS policies
drop policy if exists "Users can access own upload_audit_logs" on public.upload_audit_logs;
create policy "Users can access own upload_audit_logs" on public.upload_audit_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_upload_audit_logs_user_id on public.upload_audit_logs(user_id);
create index if not exists idx_upload_audit_logs_upload_id on public.upload_audit_logs(upload_id);
create index if not exists idx_upload_audit_logs_created_at on public.upload_audit_logs(created_at);

-- RPC for deleting user data
create or replace function public.delete_user_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete in dependency safe order
  delete from public.keywords where user_id = current_user_id;
  delete from public.keyword_gaps where user_id = current_user_id;
  delete from public.competitor_pages where user_id = current_user_id;
  delete from public.backlinks where user_id = current_user_id;
  delete from public.referring_domains where user_id = current_user_id;
  delete from public.anchor_texts where user_id = current_user_id;
  delete from public.dedupe_reports where user_id = current_user_id;
  delete from public.upload_audit_logs where user_id = current_user_id;
  delete from public.opportunity_workflow_items where user_id = current_user_id;
  delete from public.content_brief_workflows where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;

  delete from public.uploads where user_id = current_user_id;
  delete from public.competitors where user_id = current_user_id;
  delete from public.projects where user_id = current_user_id;
  delete from public.profiles where id = current_user_id;
end;
$$;

-- Revoke execute from public/anon and grant to authenticated
revoke execute on function public.delete_user_data() from public;
grant execute on function public.delete_user_data() to authenticated;
