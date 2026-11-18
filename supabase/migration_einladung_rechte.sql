-- =====================================================================
-- OrgaMe: Einladung mit Rechten (18.11.2026)
-- Regel: Wer einlädt, kann nur Rechte und Mannschaften weitergeben,
--        die er selbst hat. Das prüft die Datenbank – nicht nur die App.
-- Einmal komplett im SQL-Editor von Supabase ausführen.
-- Rückgängig: ganz unten (Abschnitt RÜCKGÄNGIG).
-- =====================================================================

-- ---------- 0. Sicherung der Funktionen, die hier erweitert werden ----------
create table if not exists public.orgame_backup_funcs (name text, def text, saved_at timestamptz default now());
alter table public.orgame_backup_funcs enable row level security;
insert into public.orgame_backup_funcs (name, def)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('can_book', 'can_manage_team', 'post_news', 'join_open_club')
  and not exists (select 1 from public.orgame_backup_funcs b where b.name = p.proname);

-- ---------- 1. Tabellen ----------
-- Einzelne Rechte einer Person (aus einer Einladung)
create table if not exists public.member_rights (
  club_id    uuid not null,
  user_id    uuid not null,
  recht      text not null check (recht in ('platz', 'halle', 'spieler', 'news', 'sportheim', 'einladen')),
  team_id    uuid,
  granted_by uuid,
  created_at timestamptz not null default now(),
  foreign key (club_id, user_id) references public.members (club_id, user_id) on delete cascade,
  foreign key (club_id, team_id) references public.teams (club_id, id) on delete cascade
);
create unique index if not exists member_rights_uq
  on public.member_rights (club_id, user_id, recht, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.member_rights enable row level security;   -- Zugriff nur über die Funktionen unten

-- Einladungen mit Rechten (QR-Code / Link ?einladung=CODE), einmal nutzbar, 7 Tage gültig
create table if not exists public.rights_invites (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete cascade,
  code       text not null unique,
  name       text not null default '',
  rechte     text[] not null default '{}',
  teams      uuid[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
alter table public.rights_invites enable row level security;  -- Zugriff nur über die Funktionen unten

-- ---------- 2. Welche Rechte hat eine Person? ----------
create or replace function public.orgame_recht_name(p text)
returns text language sql immutable set search_path to '' as $$
  select case p
    when 'platz' then 'Sportplätze belegen'
    when 'halle' then 'Sporthallen belegen'
    when 'spieler' then 'Spieler verwalten'
    when 'news' then 'Breaking News posten'
    when 'sportheim' then 'Sportheim verwalten'
    when 'einladen' then 'Mitglieder einladen'
    else p end;
$$;

-- Alle wirksamen Rechte: Admin = alles; Trainer = Plätze, Hallen, Spieler, News für seine Mannschaften;
-- Sportheim-Admins = Sportheim; dazu Rechte aus Einladungen und (falls eingeschaltet) aus dem Rollensystem.
create or replace function public.orgame_rechte(p_club uuid, p_user uuid)
returns table (recht text, team_id uuid)
language plpgsql stable security definer set search_path to '' as $$
declare v_role text; v_sch boolean;
begin
  select m.role into v_role from public.members m
   where m.club_id = p_club and m.user_id = p_user and m.status = 'active';
  if v_role is null then return; end if;
  v_sch := coalesce((select s.aktiv from public.rollen_schalter s where s.club_id = p_club), false);
  return query
  with tr(r) as (values ('platz'), ('halle'), ('spieler'), ('news')),
       cr(r) as (values ('sportheim'), ('einladen')),
       alle(r, t) as (
         select tr.r, t.id from tr cross join public.teams t where v_role = 'admin' and t.club_id = p_club
         union select cr.r, null::uuid from cr where v_role = 'admin'
         union select tr.r, mt.team_id from tr cross join public.member_teams mt
                where v_role = 'trainer' and mt.club_id = p_club and mt.user_id = p_user
         union select 'sportheim'::text, null::uuid from public.sportheim_admins s
                where s.club_id = p_club and s.user_id = p_user
         union select x.recht, x.team_id from public.member_rights x
                where x.club_id = p_club and x.user_id = p_user
         union select k.r, t.id
                 from (values ('platz', 'facilities.book'), ('halle', 'facilities.book'), ('spieler', 'trainings.manage'), ('news', 'news.publish')) k(r, p)
                 cross join public.teams t
                where v_sch and t.club_id = p_club and public._perm_check_u(p_user, p_club, k.p, 'team', t.id, false)
         union select k.r, null::uuid
                 from (values ('sportheim', 'restaurant.manage'), ('einladen', 'roles.assign')) k(r, p)
                where v_sch and public._perm_check_u(p_user, p_club, k.p, 'club', null, false)
       )
  select a.r, a.t from alle a;
end $$;
revoke execute on function public.orgame_rechte(uuid, uuid) from public, anon, authenticated;

-- Darf ICH (angemeldete Person) das? p_team = null für Vereinsrechte (Sportheim, Einladen)
create or replace function public.orgame_darf(p_club uuid, p_recht text, p_team uuid default null)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.orgame_rechte(p_club, auth.uid()) r
                  where r.recht = p_recht and r.team_id is not distinct from p_team);
$$;

-- Für die App: meine Rechte und ob ich eingeladen wurde
create or replace function public.orgame_meine_rechte(p_club uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'rechte', coalesce((select jsonb_agg(jsonb_build_object('r', r.recht, 't', r.team_id))
                          from public.orgame_rechte(p_club, auth.uid()) r), '[]'::jsonb),
    'eingeladen', exists (select 1 from public.rights_invites i where i.club_id = p_club and i.used_by = auth.uid()),
    'von', (select m.display_name from public.rights_invites i
              join public.members m on m.club_id = i.club_id and m.user_id = i.created_by
             where i.club_id = p_club and i.used_by = auth.uid() order by i.used_at desc limit 1));
$$;

-- ---------- 3. Einladung erstellen ----------
create or replace function public.orgame_einladung_erstellen(p_club uuid, p_name text, p_rechte text[], p_teams uuid[])
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_rechte text[]; v_teams uuid[]; v_teamr text[];
  v_fehlt text[] := '{}';
  v_r text; v_t uuid; v_code text; v_row public.rights_invites;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  if not public.orgame_darf(p_club, 'einladen', null) then
    raise exception 'Du darfst niemanden einladen.' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'Bitte den Namen der Person eingeben.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_rechte from unnest(coalesce(p_rechte, '{}'::text[])) x;
  select coalesce(array_agg(distinct x), '{}') into v_teams from unnest(coalesce(p_teams, '{}'::uuid[])) x;
  foreach v_r in array v_rechte loop
    if v_r not in ('platz', 'halle', 'spieler', 'news', 'sportheim', 'einladen') then
      raise exception 'Unbekanntes Recht: %', v_r; end if;
  end loop;
  if exists (select 1 from unnest(v_teams) t where not exists (select 1 from public.teams x where x.id = t and x.club_id = p_club)) then
    raise exception 'Diese Mannschaft gibt es hier nicht.'; end if;
  v_teamr := array(select x from unnest(v_rechte) x where x in ('platz', 'halle', 'spieler', 'news'));
  if cardinality(v_teamr) > 0 and cardinality(v_teams) = 0 then
    raise exception 'Bitte mindestens eine Mannschaft auswählen.'; end if;

  -- Kernregel: nur weitergeben, was man selbst hat
  foreach v_r in array v_rechte loop
    if v_r in ('sportheim', 'einladen') then
      if not public.orgame_darf(p_club, v_r, null) then v_fehlt := v_fehlt || public.orgame_recht_name(v_r); end if;
    else
      foreach v_t in array v_teams loop
        if not public.orgame_darf(p_club, v_r, v_t) then
          v_fehlt := v_fehlt || (public.orgame_recht_name(v_r) || ' (' || (select name from public.teams where id = v_t) || ')');
        end if;
      end loop;
    end if;
  end loop;
  -- Mannschaften: nur solche, in denen man selbst ein Recht hat
  foreach v_t in array v_teams loop
    if not exists (select 1 from public.orgame_rechte(p_club, v_uid) r where r.team_id = v_t) then
      v_fehlt := v_fehlt || ('Mannschaft ' || (select name from public.teams where id = v_t));
    end if;
  end loop;
  if cardinality(v_fehlt) > 0 then
    raise exception 'Das hast du selbst nicht und kannst es deshalb nicht weitergeben: %', array_to_string(v_fehlt, ', ')
      using errcode = '42501';
  end if;

  loop
    v_code := public._new_code();
    exit when not exists (select 1 from public.rights_invites where code = v_code)
          and not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.rights_invites (club_id, code, name, rechte, teams, created_by)
  values (p_club, v_code, v_name, v_rechte, v_teams, v_uid) returning * into v_row;
  return jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at);
end $$;

-- ---------- 4. Einladung ansehen (auch ohne Anmeldung) ----------
create or replace function public.orgame_einladung_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v public.rights_invites;
begin
  select * into v from public.rights_invites where code = public._norm_code(p_code);
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'status', case when v.revoked_at is not null then 'zurückgezogen'
                   when v.used_at is not null then 'eingelöst'
                   when v.expires_at <= now() then 'abgelaufen' else 'offen' end,
    'club', (select name from public.clubs where id = v.club_id),
    'club_id', v.club_id,
    'name', v.name,
    'von', (select display_name from public.members where club_id = v.club_id and user_id = v.created_by),
    'rechte', (select coalesce(jsonb_agg(public.orgame_recht_name(x)), '[]'::jsonb) from unnest(v.rechte) x),
    'teams', (select coalesce(jsonb_agg(t.name order by t.sort, t.name), '[]'::jsonb) from public.teams t where t.id = any (v.teams)),
    'gueltig_bis', v.expires_at);
end $$;

-- ---------- 5. Einladung annehmen ----------
-- Zählt nur, was in der gespeicherten Einladung steht (nicht was im QR-Code steht),
-- und davon nur, was die einladende Person JETZT noch hat.
create or replace function public.orgame_einladung_annehmen(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v public.rights_invites;
  v_name text := btrim(coalesce(p_name, ''));
  v_exist text; v_r text; v_t uuid; v_gekappt int := 0;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  select * into v from public.rights_invites where code = public._norm_code(p_code) for update;
  if not found then raise exception 'Diese Einladung gibt es nicht.' using errcode = 'P0002'; end if;
  if v.revoked_at is not null then raise exception 'Diese Einladung wurde zurückgezogen.' using errcode = 'P0002'; end if;
  if v.used_at is not null then
    if v.used_by = v_uid then return jsonb_build_object('club_id', v.club_id, 'gekappt', 0, 'schon', true); end if;
    raise exception 'Diese Einladung wurde schon eingelöst.' using errcode = 'P0002';
  end if;
  if v.expires_at <= now() then raise exception 'Diese Einladung ist abgelaufen.' using errcode = 'P0002'; end if;
  if v_name = '' then v_name := v.name; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'Bitte deinen Namen angeben.'; end if;
  if not exists (select 1 from public.orgame_rechte(v.club_id, v.created_by) r where r.recht = 'einladen') then
    raise exception 'Die einladende Person darf inzwischen niemanden mehr einladen.' using errcode = '42501';
  end if;

  select m.status into v_exist from public.members m where m.club_id = v.club_id and m.user_id = v_uid;
  if v_exist is null then
    -- Wer Mannschaftsrechte bekommt (Belegen, Spieler verwalten), wird als Trainer/Betreuer geführt,
    -- alle anderen als Spieler.
    insert into public.members (club_id, user_id, display_name, role, status, club_role)
    values (v.club_id, v_uid, v_name, 'member', 'active',
            case when v.rechte && array['platz', 'halle', 'spieler'] then 'trainer' else 'spieler' end);
  elsif v_exist = 'pending' then
    update public.members set status = 'active' where club_id = v.club_id and user_id = v_uid;
  end if;

  foreach v_t in array v.teams loop
    if exists (select 1 from public.orgame_rechte(v.club_id, v.created_by) r where r.team_id = v_t) then
      begin
        insert into public.member_teams (club_id, user_id, team_id) values (v.club_id, v_uid, v_t) on conflict do nothing;
      exception when others then null;  -- z. B. Mannschaft voll (50 Spieler): Rechte gelten trotzdem
      end;
    else v_gekappt := v_gekappt + 1; end if;
  end loop;

  foreach v_r in array v.rechte loop
    if v_r in ('sportheim', 'einladen') then
      if exists (select 1 from public.orgame_rechte(v.club_id, v.created_by) r where r.recht = v_r and r.team_id is null) then
        insert into public.member_rights (club_id, user_id, recht, team_id, granted_by)
        values (v.club_id, v_uid, v_r, null, v.created_by) on conflict do nothing;
        if v_r = 'sportheim' then
          insert into public.sportheim_admins (club_id, user_id) values (v.club_id, v_uid) on conflict do nothing;
        end if;
      else v_gekappt := v_gekappt + 1; end if;
    else
      foreach v_t in array v.teams loop
        if exists (select 1 from public.orgame_rechte(v.club_id, v.created_by) r where r.recht = v_r and r.team_id = v_t) then
          insert into public.member_rights (club_id, user_id, recht, team_id, granted_by)
          values (v.club_id, v_uid, v_r, v_t, v.created_by) on conflict do nothing;
        else v_gekappt := v_gekappt + 1; end if;
      end loop;
    end if;
  end loop;

  update public.rights_invites set used_at = now(), used_by = v_uid where id = v.id;
  return jsonb_build_object('club_id', v.club_id, 'gekappt', v_gekappt, 'schon', false);
end $$;

-- ---------- 6. Vereine für „Verein auswählen“ ----------
create or replace function public.orgame_vereine(p_q text)
returns table (id uuid, name text, offen boolean)
language sql stable security definer set search_path to '' as $$
  with q as (select btrim(coalesce(p_q, '')) s)
  select c.id, c.name, c.open_access from public.clubs c, q
   where (char_length(q.s) >= 2 and c.name ilike '%' || replace(replace(q.s, '%', ''), '_', '') || '%')
      or (char_length(q.s) < 2 and (c.open_access or exists (select 1 from public.members m where m.club_id = c.id and m.user_id = auth.uid())))
   order by c.open_access desc, c.name
   limit 20;
$$;

-- ---------- 7. Bestehende Prüfungen um die neuen Rechte erweitern ----------
-- Belegen: zusätzlich Plätze/Hallen-Recht aus einer Einladung
create or replace function public.can_book(p_club uuid, p_team uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select not exists (select 1 from public.teams tt where tt.id = p_team and tt.name ~* 'mitglieder\s*(&|und)\s*fans')
     and (public.is_admin(p_club)
       or exists (select 1 from public.members m join public.member_teams t on t.club_id = m.club_id and t.user_id = m.user_id
                   where m.club_id = p_club and m.user_id = auth.uid() and m.status = 'active' and m.role = 'trainer' and t.team_id = p_team)
       or (coalesce((select s.aktiv from public.rollen_schalter s where s.club_id = p_club), false)
           and public._perm_check(p_club, 'facilities.book', 'team', p_team, false))
       or exists (select 1 from public.member_rights x join public.members m on m.club_id = x.club_id and m.user_id = x.user_id and m.status = 'active'
                   where x.club_id = p_club and x.user_id = auth.uid() and x.team_id = p_team and x.recht in ('platz', 'halle')));
$$;

-- Spieler verwalten: zusätzlich Recht „spieler“ aus einer Einladung
create or replace function public.can_manage_team(p_club uuid, p_team uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.is_admin(p_club)
      or exists (select 1 from public.members m join public.member_teams t on t.club_id = m.club_id and t.user_id = m.user_id
                  where m.club_id = p_club and m.user_id = auth.uid() and m.status = 'active' and m.role = 'trainer' and t.team_id = p_team)
      or (coalesce((select s.aktiv from public.rollen_schalter s where s.club_id = p_club), false)
          and public._perm_check(p_club, 'trainings.manage', 'team', p_team, false))
      or exists (select 1 from public.member_rights x join public.members m on m.club_id = x.club_id and m.user_id = x.user_id and m.status = 'active'
                  where x.club_id = p_club and x.user_id = auth.uid() and x.team_id = p_team and x.recht = 'spieler');
$$;

-- Plätze bzw. Hallen: Wer nur „Sportplätze belegen“ hat, darf keine Halle belegen (und umgekehrt)
create or replace function public.tg_orgame_ort()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_grp text;
begin
  if auth.uid() is null or new.facility_id is null then return new; end if;
  select f.grp into v_grp from public.facilities f where f.id = new.facility_id;
  if v_grp is null or v_grp not in ('platz', 'halle') then return new; end if;
  if public.is_admin(new.club_id) then return new; end if;
  if not exists (select 1 from public.orgame_rechte(new.club_id, auth.uid()) r where r.recht = v_grp and r.team_id = new.team_id) then
    raise exception 'Für % hast du bei dieser Mannschaft kein Belegungsrecht.',
      case v_grp when 'platz' then 'Sportplätze' else 'Sporthallen' end using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists orgame_ort on public.bookings;
create trigger orgame_ort before insert or update on public.bookings
  for each row execute function public.tg_orgame_ort();

-- Breaking News: eigenes Recht „news“ (Admins und Trainer wie bisher)
create or replace function public.post_news(p_club uuid, p_team uuid, p_body text)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_body text := btrim(coalesce(p_body, '')); v_name text; v_id uuid;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  if v_body = '' then raise exception 'Bitte eine Meldung eingeben.' using errcode = 'P0001'; end if;
  if char_length(v_body) > 200 then raise exception 'Die Meldung darf höchstens 200 Zeichen lang sein.' using errcode = 'P0001'; end if;
  if p_team is null then
    if not public.is_admin(p_club) then raise exception 'Dafür fehlen dir die Rechte.' using errcode = '42501'; end if;
  else
    if not exists (select 1 from public.teams t where t.id = p_team and t.club_id = p_club) then
      raise exception 'Diese Mannschaft gibt es nicht.' using errcode = 'P0001'; end if;
    if not (public.orgame_darf(p_club, 'news', p_team)
            or (coalesce((select s.aktiv from public.rollen_schalter s where s.club_id = p_club), false) and public.can_book(p_club, p_team))) then
      raise exception 'Dafür fehlen dir die Rechte.' using errcode = '42501';
    end if;
  end if;
  select m.display_name into v_name from public.members m where m.club_id = p_club and m.user_id = v_uid;
  insert into public.news (club_id, team_id, author_id, author_name, body)
  values (p_club, p_team, v_uid, coalesce(v_name, ''), v_body) returning id into v_id;
  delete from public.news n where n.club_id = p_club and n.expires_at < now() - interval '1 day';
  return v_id;
end $$;

-- Offener Testverein: Wer per Einladung beigetreten ist, wird beim nächsten Start NICHT automatisch Admin
create or replace function public.join_open_club()
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_club uuid;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  select c.id into v_club from public.clubs c where c.open_access order by c.created_at limit 1;
  if v_club is null then return null; end if;
  insert into public.members (club_id, user_id, display_name, role, status, club_role)
  values (v_club, v_uid, 'Testnutzer', 'admin', 'active', 'vorstand')
  on conflict (club_id, user_id) do update set role = 'admin', status = 'active'
   where not exists (select 1 from public.rights_invites i where i.club_id = excluded.club_id and i.used_by = excluded.user_id);
  return v_club;
end $$;

-- ---------- 8. Rechte für die App ----------
revoke execute on function public.orgame_darf(uuid, text, uuid) from public, anon;
revoke execute on function public.orgame_meine_rechte(uuid) from public, anon;
revoke execute on function public.orgame_einladung_erstellen(uuid, text, text[], uuid[]) from public, anon;
revoke execute on function public.orgame_einladung_annehmen(text, text) from public, anon;
grant execute on function public.orgame_darf(uuid, text, uuid) to authenticated;
grant execute on function public.orgame_meine_rechte(uuid) to authenticated;
grant execute on function public.orgame_einladung_erstellen(uuid, text, text[], uuid[]) to authenticated;
grant execute on function public.orgame_einladung_annehmen(text, text) to authenticated;
grant execute on function public.orgame_einladung_info(text) to anon, authenticated;
grant execute on function public.orgame_vereine(text) to anon, authenticated;

-- =====================================================================
-- RÜCKGÄNGIG (nur bei Bedarf, einzeln ausführen):
--   drop trigger if exists orgame_ort on public.bookings;
--   do $$ declare r record; begin
--     for r in select distinct on (name) def from public.orgame_backup_funcs order by name, saved_at loop execute r.def; end loop;
--   end $$;
-- Die Tabellen member_rights und rights_invites können danach stehen bleiben (stören nicht).
-- =====================================================================
