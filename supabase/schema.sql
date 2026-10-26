-- Tabla para guardar el progreso de estudio de cada usuario.
-- Pega todo este archivo en Supabase → SQL Editor → New query → Run.

create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Cada persona solo puede ver y cambiar su propio progreso.
drop policy if exists "leer mi progreso" on public.progress;
create policy "leer mi progreso" on public.progress
  for select using (auth.uid() = user_id);

drop policy if exists "crear mi progreso" on public.progress;
create policy "crear mi progreso" on public.progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "actualizar mi progreso" on public.progress;
create policy "actualizar mi progreso" on public.progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
