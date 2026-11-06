-- Bildet nur die von Supabase bereitgestellten Teile nach (für lokale Tests).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema extensions;
grant usage on schema auth, extensions, public to anon, authenticated;
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
-- Wie bei Supabase: neue Objekte in public sind standardmäßig für die API-Rollen freigegeben
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
