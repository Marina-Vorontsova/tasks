create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  description text not null default '',
  status text not null check (status in ('active', 'completed', 'cancelled')),
  created_at bigint not null,
  archived_at bigint,
  available_after_active_date date
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_task_id uuid,
  current_active_date date,
  success_image_date date,
  has_completed_onboarding boolean not null default false
);

alter table public.tasks enable row level security;
alter table public.user_settings enable row level security;

create policy "Users can manage their own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
