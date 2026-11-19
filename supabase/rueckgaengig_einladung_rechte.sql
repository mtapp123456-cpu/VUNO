-- Macht migration_einladung_rechte.sql vollständig rückgängig (19.11.2026)
-- 1. Testmitglieder aus Einladungen entfernen (Max Test, Lisa Test …) samt ihrer anonymen Konten
-- 2. Alte Fassungen von can_book, can_manage_team, post_news, join_open_club zurückholen
-- 3. Neue Funktionen, Trigger und Tabellen löschen
begin;
create temp table _og_users on commit drop as
  select distinct i.used_by as id, i.club_id from public.rights_invites i where i.used_by is not null;
delete from public.members m using _og_users u where m.user_id = u.id and m.club_id = u.club_id;
delete from auth.users a using _og_users u
 where a.id = u.id and a.is_anonymous and not exists (select 1 from public.members m where m.user_id = a.id);

drop trigger if exists orgame_ort on public.bookings;
do $$ declare r record; begin
  for r in select distinct on (name) def from public.orgame_backup_funcs order by name, saved_at loop
    execute r.def;
  end loop;
end $$;

drop function if exists public.tg_orgame_ort();
drop function if exists public.orgame_einladung_annehmen(text, text);
drop function if exists public.orgame_einladung_info(text);
drop function if exists public.orgame_einladung_erstellen(uuid, text, text[], uuid[]);
drop function if exists public.orgame_meine_rechte(uuid);
drop function if exists public.orgame_darf(uuid, text, uuid);
drop function if exists public.orgame_vereine(text);
drop function if exists public.orgame_rechte(uuid, uuid);
drop function if exists public.orgame_recht_name(text);
drop table if exists public.member_rights;
drop table if exists public.rights_invites;
drop table if exists public.orgame_backup_funcs;
commit;

select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'orgame%') as orgame_funktionen,
       (select count(*) from pg_trigger where tgname = 'orgame_ort') as trigger,
       position('member_rights' in pg_get_functiondef('public.can_book'::regproc)) = 0 as can_book_alt,
       position('rights_invites' in pg_get_functiondef('public.join_open_club'::regproc)) = 0 as join_open_club_alt;
