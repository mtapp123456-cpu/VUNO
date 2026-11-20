-- OrgaMe migration_18 (20.11.2026): Gruppen für Einzelsportarten
--   Einzelsport-Abteilungen (Reiten, Kampfsport, Leichtathletik, Schwimmen …) bekommen
--   statt Mannschaften Gruppen: Altersklasse, Leistungsgruppe oder Kurs.
--   Optional mit Disziplin (Dressur, Springen · Boxen, Judo …).
--
-- Technik: Eine Gruppe ist eine normale Zeile in public.teams. Dadurch gelten automatisch
--   50 Plätze (team_limit), Abstimmung 👍 ❓ 👎, Termine, Kalender und Rechte wie bei Mannschaften.
--   Es kommen nur neue Spalten dazu. Bestehende Daten und Funktionen bleiben unverändert.
--
-- Im SQL-Editor von Supabase komplett ausführen. Kann gefahrlos mehrfach ausgeführt werden.
-- Rückgängig: ganz unten (auskommentiert).

alter table public.teams add column if not exists group_type text not null default 'mannschaft';
alter table public.teams drop constraint if exists teams_group_type_check;
alter table public.teams add constraint teams_group_type_check
  check (group_type in ('mannschaft', 'altersklasse', 'leistung', 'kurs'));

-- Disziplin innerhalb der Abteilung (leer = keine Disziplin-Ebene)
alter table public.teams add column if not exists discipline text not null default '';

-- Altersklasse: Alter von/bis (Jahrgänge rechnet die App aus dem aktuellen Jahr aus,
-- dadurch rückt jede Gruppe am 1. Januar automatisch weiter). null = offen.
alter table public.teams add column if not exists age_min smallint;
alter table public.teams add column if not exists age_max smallint;
alter table public.teams drop constraint if exists teams_age_check;
alter table public.teams add constraint teams_age_check
  check ((age_min is null or age_min between 0 and 120)
     and (age_max is null or age_max between 0 and 120)
     and (age_min is null or age_max is null or age_min <= age_max));

-- Geschlecht: gemischt / m / w
alter table public.teams add column if not exists gender text not null default 'gemischt';
alter table public.teams drop constraint if exists teams_gender_check;
alter table public.teams add constraint teams_gender_check check (gender in ('gemischt', 'm', 'w'));

-- Leistungsgruppe: freie Stufe (z. B. „RA 9–8“, „8.–7. Kyu“, „LK 5–4“, „Startklasse C“)
alter table public.teams add column if not exists level text not null default '';

-- Abteilung als Einzelsport markiert (die App zeigt dann Gruppen statt Mannschaften)
create table if not exists public.department_settings (
  club_id uuid not null references public.clubs(id) on delete cascade,
  department text not null,
  individual boolean not null default false,
  sport_key text not null default '',
  disciplines text[] not null default '{}',
  primary key (club_id, department)
);
alter table public.department_settings enable row level security;

drop policy if exists department_settings_read on public.department_settings;
create policy department_settings_read on public.department_settings
  for select using (public.is_active_member(club_id));

drop policy if exists department_settings_write on public.department_settings;
create policy department_settings_write on public.department_settings
  for all using (public.is_admin(club_id)) with check (public.is_admin(club_id));

grant select, insert, update, delete on public.department_settings to authenticated;

create index if not exists teams_department_discipline_idx on public.teams (club_id, department, discipline);

notify pgrst, 'reload schema';

/* ---------- Ergebnis ---------- */
select 'Spalten Gruppen (teams)' as punkt,
       case when (select count(*) from information_schema.columns
                  where table_schema = 'public' and table_name = 'teams'
                    and column_name in ('group_type', 'discipline', 'age_min', 'age_max', 'gender', 'level')) = 6
            then 'OK' else 'FEHLT' end as stand
union all
select 'Tabelle department_settings',
       case when to_regclass('public.department_settings') is not null then 'OK' else 'FEHLT' end;

/* ---------- Rückgängig (nur bei Bedarf, löscht die Gruppen-Angaben) ----------
drop table if exists public.department_settings;
alter table public.teams drop constraint if exists teams_group_type_check;
alter table public.teams drop constraint if exists teams_age_check;
alter table public.teams drop constraint if exists teams_gender_check;
alter table public.teams drop column if exists group_type, drop column if exists discipline,
  drop column if exists age_min, drop column if exists age_max,
  drop column if exists gender, drop column if exists level;
notify pgrst, 'reload schema';
*/
