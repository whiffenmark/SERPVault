-- Migration: 20260701000001_user_settings.sql
-- Create user_settings table with RLS for storing user configuration key-values.

create table if not exists public.user_settings (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  value jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (user_id, key)
);

-- Enable RLS on user_settings
alter table public.user_settings enable row level security;

-- Define RLS policies for user_settings
drop policy if exists "Users can access own user_settings" on public.user_settings;
create policy "Users can access own user_settings" on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create index on user_id for faster queries scoping by user
create index if not exists idx_user_settings_user_id on public.user_settings(user_id);
