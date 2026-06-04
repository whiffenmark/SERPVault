-- SERPVault Supabase Schema
-- Run this in your Supabase SQL Editor to create tables

create table if not exists uploads (
  id text primary key,
  filename text not null,
  report_type text not null,
  uploaded_at timestamptz default now(),
  row_count integer default 0,
  cleaned_row_count integer default 0,
  dedupe_report_id text
);

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
