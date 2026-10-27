-- Tabla para guardar «Tu espacio» (tareas, notas y agenda) en Supabase.
-- Pegar en Supabase > SQL Editor > New query > Run.
create table if not exists public.wolskia_space (
  user_id    text primary key,
  data       jsonb not null default '{"tasks":[],"notes":[],"events":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seguridad: con RLS activado y SIN políticas, nadie puede leer/escribir con la clave pública (anon).
-- El backend usa la clave "service_role" (secreta), que se saltea RLS.
alter table public.wolskia_space enable row level security;
