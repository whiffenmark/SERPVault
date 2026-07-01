-- Migration: 20260701000002_opportunity_workflow.sql
-- Create opportunity_workflow_items table with RLS.

create table if not exists public.opportunity_workflow_items (
  user_id uuid references auth.users(id) on delete cascade not null,
  opportunity_id text not null,
  status text not null check (status in ('New', 'Planned', 'In Progress', 'Done', 'Ignored')),
  project_id text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (user_id, opportunity_id)
);

-- Enable RLS
alter table public.opportunity_workflow_items enable row level security;

-- RLS policies
drop policy if exists "Users can access own opportunity_workflow_items" on public.opportunity_workflow_items;
create policy "Users can access own opportunity_workflow_items" on public.opportunity_workflow_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_opportunity_workflow_items_user_id on public.opportunity_workflow_items(user_id);
create index if not exists idx_opportunity_workflow_items_project_id on public.opportunity_workflow_items(project_id);
