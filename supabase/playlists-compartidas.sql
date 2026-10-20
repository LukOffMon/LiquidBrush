-- LiquidBrush · playlists guardadas "para todos" con la KeyForSet (proyecto principal LoopMusiK)
-- Pégalo en: Supabase → SQL Editor → New query → Run.
-- La clave nunca está en el código del sitio: se guarda aquí como hash y se comprueba en el servidor.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Claves de la app, guardadas solo como hash bcrypt
create table if not exists private.app_keys (
  name text primary key,
  hash text not null
);

-- Intentos fallidos, para frenar a quien pruebe contraseñas al azar
create table if not exists private.key_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  emoji text not null default '' check (char_length(emoji) <= 8),
  color text not null default '' check (color = '' or color ~ '^#[0-9a-fA-F]{6}$'),
  track_ids text[] not null default '{}' check (cardinality(track_ids) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shared_playlists is 'Playlists de LiquidBrush guardadas para todos con la KeyForSet. track_ids usa los ids de canción de la app.';

-- La web solo puede leer; crear, cambiar y borrar va por las funciones de abajo
alter table public.shared_playlists enable row level security;
drop policy if exists "Lectura pública de playlists compartidas" on public.shared_playlists;
create policy "Lectura pública de playlists compartidas"
  on public.shared_playlists for select
  to anon, authenticated
  using (true);
grant select on public.shared_playlists to anon, authenticated;

-- Comprueba la clave; lanza error si es incorrecta o si hubo demasiados fallos recientes
create or replace function private.require_set_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if (select count(*) from private.key_failures where created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'demasiados_intentos' using errcode = 'P0001';
  end if;
  select hash into v_hash from private.app_keys where name = 'KeyForSet';
  if v_hash is null or p_key is null or extensions.crypt(p_key, v_hash) <> v_hash then
    insert into private.key_failures default values;
    raise exception 'clave_incorrecta' using errcode = 'P0001';
  end if;
  delete from private.key_failures where created_at < now() - interval '1 day';
end;
$$;

-- Crea (p_id nulo) o actualiza una playlist compartida
create or replace function public.save_shared_playlist(
  p_key text,
  p_id uuid,
  p_name text,
  p_emoji text,
  p_color text,
  p_track_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_set_key(p_key);
  if p_id is not null then
    update public.shared_playlists
       set name = trim(p_name), emoji = coalesce(p_emoji, ''), color = coalesce(p_color, ''),
           track_ids = coalesce(p_track_ids, '{}'), updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;
  if v_id is null then
    insert into public.shared_playlists (name, emoji, color, track_ids)
    values (trim(p_name), coalesce(p_emoji, ''), coalesce(p_color, ''), coalesce(p_track_ids, '{}'))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_shared_playlist(p_key text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_set_key(p_key);
  delete from public.shared_playlists where id = p_id;
end;
$$;

revoke all on function private.require_set_key(text) from public, anon, authenticated;
revoke all on function public.save_shared_playlist(text, uuid, text, text, text, text[]) from public;
revoke all on function public.delete_shared_playlist(text, uuid) from public;
grant execute on function public.save_shared_playlist(text, uuid, text, text, text, text[]) to anon, authenticated;
grant execute on function public.delete_shared_playlist(text, uuid) to anon, authenticated;

-- Para poner o cambiar la clave, ejecuta aparte (cambiando TU_CLAVE):
-- insert into private.app_keys (name, hash)
-- values ('KeyForSet', extensions.crypt('TU_CLAVE', extensions.gen_salt('bf')))
-- on conflict (name) do update set hash = excluded.hash;
