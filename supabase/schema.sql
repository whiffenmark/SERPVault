-- SERPVault Supabase Schema
-- Run this in your Supabase SQL Editor to create tables

create table if not exists projects (
  id text primary key,
  name text not null,
  domain text not null,
  location text,
  niche text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

create table if not exists competitors (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  domain text not null,
  label text,
  created_at timestamptz default now()
);

create table if not exists uploads (
  id text primary key,
  filename text not null,
  report_type text not null,
  uploaded_at timestamptz default now(),
  row_count integer default 0,
  cleaned_row_count integer default 0,
  dedupe_report_id text,
  project_id text references projects(id),
  source_tool text
);

alter table uploads add column if not exists project_id text references projects(id);
alter table uploads add column if not exists source_tool text;


create table if not exists keywords (
  id text primary key,
  upload_id text references uploads(id),
  keyword text not null,
  volume integer,
  difficulty numeric,
  cpc numeric,
  intent text,
  database text,
  country text,
  position integer,
  url text,
  tag text,
  opportunity_score integer,
  raw jsonb
);

create table if not exists keyword_gaps (
  id text primary key,
  upload_id text references uploads(id),
  keyword text not null,
  competitor_domain text,
  your_domain text,
  competitor_position integer,
  your_position integer,
  volume integer,
  difficulty numeric,
  intent text,
  tag text,
  opportunity_score integer,
  raw jsonb
);

create table if not exists competitor_pages (
  id text primary key,
  upload_id text references uploads(id),
  domain text,
  url text,
  title text,
  traffic integer,
  traffic_share numeric,
  keywords integer,
  tag text,
  opportunity_score integer,
  raw jsonb
);

create table if not exists backlinks (
  id text primary key,
  upload_id text references uploads(id),
  source_url text,
  target_url text,
  anchor_text text,
  domain_authority integer,
  domain_rating integer,
  traffic_source integer,
  do_follow boolean,
  tag text,
  opportunity_score integer,
  raw jsonb
);

create table if not exists referring_domains (
  id text primary key,
  upload_id text references uploads(id),
  referring_domain text,
  target_domain text,
  domain_authority integer,
  domain_rating integer,
  backlinks integer,
  tag text,
  opportunity_score integer,
  raw jsonb
);

create table if not exists anchor_texts (
  id text primary key,
  upload_id text references uploads(id),
  anchor_text text,
  backlinks integer,
  referring_domains integer,
  do_follow integer,
  tag text,
  raw jsonb
);

create table if not exists dedupe_reports (
  id text primary key,
  upload_id text references uploads(id),
  filename text,
  report_type text,
  created_at timestamptz default now(),
  total_rows integer,
  duplicates_removed integer,
  cleaned_rows integer,
  dedupe_key text,
  issues jsonb,
  duplicate_examples jsonb
);

-- ---------------------------------------------------------------------------
-- Disable Row Level Security for personal use.
-- This allows the publishable key to read/write all tables freely.
-- If you add Supabase Auth later, re-enable RLS and add user-scoped policies.
-- NOTE: For production environments, refer to migrations under supabase/migrations/,
-- specifically 20260701000000_auth_rls_foundation.sql which enables RLS, adds
-- user_id fields/indexes, and configures user-scoped access policies.
-- ---------------------------------------------------------------------------
alter table projects disable row level security;
alter table competitors disable row level security;
alter table uploads disable row level security;
alter table keywords disable row level security;
alter table keyword_gaps disable row level security;
alter table competitor_pages disable row level security;
alter table backlinks disable row level security;
alter table referring_domains disable row level security;
alter table anchor_texts disable row level security;
alter table dedupe_reports disable row level security;

create table if not exists user_settings (
  user_id uuid,
  key text,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz,
  primary key (user_id, key)
);

alter table user_settings disable row level security;

create table if not exists opportunity_workflow_items (
  user_id uuid,
  opportunity_id text,
  status text check (status in ('New', 'Planned', 'In Progress', 'Done', 'Ignored')),
  project_id text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz,
  primary key (user_id, opportunity_id)
);

alter table opportunity_workflow_items disable row level security;
