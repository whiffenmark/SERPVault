-- Migration: 20260701000003_content_brief_workflow.sql
-- Create content_brief_workflows table with RLS.

create table if not exists public.content_brief_workflows (
  user_id uuid references auth.users(id) on delete cascade not null,
  brief_id text not null,
  status text not null check (status in ('Draft', 'In Review', 'Approved', 'Published', 'Archived')),
  owner text,
  due_date text,
  notes text,
  checked_items jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (user_id, brief_id)
);

-- Enable RLS
alter table public.content_brief_workflows enable row level security;

-- RLS policies
drop policy if exists "Users can access own content_brief_workflows" on public.content_brief_workflows;
create policy "Users can access own content_brief_workflows" on public.content_brief_workflows for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_content_brief_workflows_user_id on public.content_brief_workflows(user_id);
