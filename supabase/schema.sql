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

-- Reportes de «Mi respuesta también es correcta» en la práctica de frases.
-- Cualquiera puede enviar uno; solo tú los ves desde el panel de Supabase
-- (Table Editor → reportes).
create table if not exists public.reportes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  mazo text not null,
  frase_id text not null,
  paso text not null,
  respuesta text not null,
  esperada text,
  created_at timestamptz not null default now()
);

alter table public.reportes enable row level security;

drop policy if exists "enviar reportes" on public.reportes;
create policy "enviar reportes" on public.reportes
  for insert to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

-- Progreso de PRUEBA de la versión beta (/beta/). Misma forma y mismas reglas
-- que «progress», pero aparte: lo que hagas en la beta nunca toca tu progreso real.
create table if not exists public.progress_beta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress_beta enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'progress_beta' and policyname = 'leer mi progreso beta') then
    create policy "leer mi progreso beta" on public.progress_beta
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'progress_beta' and policyname = 'crear mi progreso beta') then
    create policy "crear mi progreso beta" on public.progress_beta
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'progress_beta' and policyname = 'actualizar mi progreso beta') then
    create policy "actualizar mi progreso beta" on public.progress_beta
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
