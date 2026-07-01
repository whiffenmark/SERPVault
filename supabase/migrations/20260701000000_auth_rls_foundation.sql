-- Migration: 20260701000000_auth_rls_foundation.sql
-- Auth and Row-Level Security (RLS) Foundation for SERPVault.

-- NOTE on Data Migration / Compatibility:
-- Existing anonymous rows in tables that lack a user_id (or have user_id = NULL)
-- represent local/personal legacy data. They remain accessible under local-first storage (localStorage)
-- and will not be queried or modified via Supabase authenticated requests until they are explicitly
-- backfilled with the user's authenticated user_id.
-- Also: competitor/research domains must not auto-create projects.

-- 1. Create profiles table linked to auth.users
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Policies for profiles
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile" on public.profiles
  for delete using (auth.uid() = id);


-- 2. Add nullable user_id column and foreign key constraint to existing tables
alter table public.projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.competitors add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.uploads add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.keywords add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.keyword_gaps add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.competitor_pages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.backlinks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.referring_domains add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.anchor_texts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.dedupe_reports add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 3. Add indexes for user_id and key foreign paths
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_competitors_user_id on public.competitors(user_id);
create index if not exists idx_competitors_project_id on public.competitors(project_id);
create index if not exists idx_uploads_user_id on public.uploads(user_id);
create index if not exists idx_uploads_project_id on public.uploads(project_id);
create index if not exists idx_keywords_user_id on public.keywords(user_id);
create index if not exists idx_keywords_upload_id on public.keywords(upload_id);
create index if not exists idx_keyword_gaps_user_id on public.keyword_gaps(user_id);
create index if not exists idx_keyword_gaps_upload_id on public.keyword_gaps(upload_id);
create index if not exists idx_competitor_pages_user_id on public.competitor_pages(user_id);
create index if not exists idx_competitor_pages_upload_id on public.competitor_pages(upload_id);
create index if not exists idx_backlinks_user_id on public.backlinks(user_id);
create index if not exists idx_backlinks_upload_id on public.backlinks(upload_id);
create index if not exists idx_referring_domains_user_id on public.referring_domains(user_id);
create index if not exists idx_referring_domains_upload_id on public.referring_domains(upload_id);
create index if not exists idx_anchor_texts_user_id on public.anchor_texts(user_id);
create index if not exists idx_anchor_texts_upload_id on public.anchor_texts(upload_id);
create index if not exists idx_dedupe_reports_user_id on public.dedupe_reports(user_id);
create index if not exists idx_dedupe_reports_upload_id on public.dedupe_reports(upload_id);

-- 4. Enable Row Level Security (RLS) on each of the tables
alter table public.projects enable row level security;
alter table public.competitors enable row level security;
alter table public.uploads enable row level security;
alter table public.keywords enable row level security;
alter table public.keyword_gaps enable row level security;
alter table public.competitor_pages enable row level security;
alter table public.backlinks enable row level security;
alter table public.referring_domains enable row level security;
alter table public.anchor_texts enable row level security;
alter table public.dedupe_reports enable row level security;

-- 5. Define row-level policies based on user_id = auth.uid()
-- Projects
drop policy if exists "Users can access own projects" on public.projects;
create policy "Users can access own projects" on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Competitors
drop policy if exists "Users can access own competitors" on public.competitors;
create policy "Users can access own competitors" on public.competitors for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Uploads
drop policy if exists "Users can access own uploads" on public.uploads;
create policy "Users can access own uploads" on public.uploads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keywords
drop policy if exists "Users can access own keywords" on public.keywords;
create policy "Users can access own keywords" on public.keywords for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keyword Gaps
drop policy if exists "Users can access own keyword_gaps" on public.keyword_gaps;
create policy "Users can access own keyword_gaps" on public.keyword_gaps for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Competitor Pages
drop policy if exists "Users can access own competitor_pages" on public.competitor_pages;
create policy "Users can access own competitor_pages" on public.competitor_pages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backlinks
drop policy if exists "Users can access own backlinks" on public.backlinks;
create policy "Users can access own backlinks" on public.backlinks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Referring Domains
drop policy if exists "Users can access own referring_domains" on public.referring_domains;
create policy "Users can access own referring_domains" on public.referring_domains for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anchor Texts
drop policy if exists "Users can access own anchor_texts" on public.anchor_texts;
create policy "Users can access own anchor_texts" on public.anchor_texts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Dedupe Reports
drop policy if exists "Users can access own dedupe_reports" on public.dedupe_reports;
create policy "Users can access own dedupe_reports" on public.dedupe_reports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
