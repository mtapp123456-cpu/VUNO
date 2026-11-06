-- Änderung 2: Rolle, Abteilung und Mannschaft beim Beitritt, Bestätigung immer, höchstens zehn Admins

alter table public.members add column club_role text not null default 'spieler'
  check (club_role in ('spieler','trainer','ausschuss','vorstand'));
alter table public.members add column department text not null default '';
alter table public.teams add column department text not null default '';

update public.members set club_role = 'vorstand' where role = 'admin';
update public.members set club_role = 'trainer' where role = 'trainer';
update public.teams set department = case
  when sport like 'Abteilung %' then substr(sport, 11)
  when sport like '% · %' then split_part(sport, ' · ', 1)
  else name end;

-- Einladungen: nur noch für Mitglieder oder Admins, immer mit Bestätigung
update public.invites set revoked_at = coalesce(revoked_at, now()) where role = 'trainer';
update public.invites set requires_approval = true;
update public.invites set role = 'member' where role = 'trainer';
alter table public.invites drop constraint invites_check;
alter table public.invites drop constraint invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('admin','member'));
alter table public.invites add constraint invites_always_approval check (requires_approval);

-- Höchstens zehn aktive Admins pro Verein
create function public.members_admin_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' and new.status = 'active' then
    perform 1 from public.clubs where id = new.club_id for update;
    if (select count(*) from public.members m where m.club_id = new.club_id
        and m.user_id <> new.user_id and m.role = 'admin' and m.status = 'active') >= 10 then
      raise exception 'Dieser Verein hat bereits zehn Admins.';
    end if;
  end if;
  return new;
end $$;
create trigger members_admin_limit before insert or update on public.members
for each row execute function public.members_admin_limit();

drop function public.invite_info(text);
create function public.invite_info(p_code text)
returns table (club_name text, role text, teams jsonb)
language sql stable security definer set search_path = '' as $$
  select c.name, i.role, coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'department', t.department) order by t.sort, t.name)
      from public.teams t where t.club_id = i.club_id), '[]'::jsonb)
  from public.invites i join public.clubs c on c.id = i.club_id
  where i.code = public._norm_code(p_code)
    and i.revoked_at is null and i.expires_at > now()
    and (i.max_uses is null or i.uses < i.max_uses);
$$;

drop function public.join_club(text, text);
create function public.join_club(p_code text, p_display_name text, p_club_role text default 'spieler', p_department text default '', p_team uuid default null)
returns table (club_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invites;
  v_existing text;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Bitte deinen Namen angeben.';
  end if;
  if p_club_role not in ('spieler','trainer','ausschuss','vorstand') then
    raise exception 'Bitte deine Rolle auswählen.';
  end if;
  if p_club_role = 'trainer' and p_team is null then
    raise exception 'Bitte als Trainer deine Mannschaft auswählen.';
  end if;
  select * into v_inv from public.invites where code = public._norm_code(p_code) for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    raise exception 'Diese Einladung ist nicht mehr gültig.' using errcode = 'P0002';
  end if;
  select m.status into v_existing from public.members m
    where m.club_id = v_inv.club_id and m.user_id = v_uid;
  if found then return query select v_inv.club_id, v_existing; return; end if;
  if v_inv.role = 'admin' and exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'Für Admins ist eine Anmeldung per E-Mail-Code nötig.' using errcode = 'P0003';
  end if;
  if p_team is not null and not exists (select 1 from public.teams t where t.id = p_team and t.club_id = v_inv.club_id) then
    raise exception 'Diese Mannschaft gibt es hier nicht.';
  end if;
  insert into public.members (club_id, user_id, display_name, role, status, club_role, department)
  values (v_inv.club_id, v_uid, trim(p_display_name),
    case when v_inv.role = 'admin' then 'admin' when p_club_role = 'trainer' then 'trainer' else 'member' end,
    'pending', p_club_role, coalesce(trim(p_department), ''));
  if p_team is not null then
    insert into public.member_teams values (v_inv.club_id, v_uid, p_team);
  end if;
  update public.invites set uses = uses + 1 where id = v_inv.id;
  return query select v_inv.club_id, 'pending'::text;
end $$;

create or replace function public.create_club(p_signup_code text, p_club_name text, p_display_name text, p_with_examples boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
begin
  if v_uid is null or exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'Bitte zuerst per E-Mail-Code anmelden.' using errcode = '42501';
  end if;
  perform 1 from public.signup_codes
    where code = public._norm_code(p_signup_code) and used_at is null for update;
  if not found then raise exception 'Dieser Freischaltcode ist nicht gültig.' using errcode = 'P0002'; end if;
  insert into public.clubs (name) values (trim(p_club_name)) returning id into v_club;
  insert into public.members (club_id, user_id, display_name, role, status, club_role)
  values (v_club, v_uid, trim(p_display_name), 'admin', 'active', 'vorstand');
  update public.signup_codes set used_at = now(), used_by = v_uid, club_id = v_club
    where code = public._norm_code(p_signup_code);
  if p_with_examples then perform public._seed_examples(v_club); end if;
  return v_club;
end $$;

create or replace function public._seed_examples(p_club uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teams (club_id, name, sport, department, icon, color, sort) values
    (p_club, '1. Mannschaft', 'Fußball · Herren', 'Fußball', '⚽', '#16a34a', 1),
    (p_club, '2. Mannschaft', 'Fußball · Herren', 'Fußball', '⚽', '#0284c7', 2),
    (p_club, 'Basketball', 'Abteilung Basketball', 'Basketball', '🏀', '#ea580c', 3),
    (p_club, 'Kendo', 'Abteilung Kendo', 'Kendo', '🥋', '#7c3aed', 4),
    (p_club, 'Verein', 'Vorstand & Veranstaltungen', 'Verein', '🍻', '#b45309', 5);
  perform public._save_facility(p_club, null, 'Sportplatz 1', 'platz', '🏟️', 'Rasen · Hauptplatz',
    array['Hälfte A','Hälfte B'], 'Ganzer Platz', '[]');
  perform public._save_facility(p_club, null, 'Sportplatz 2', 'platz', '🏟️', 'Kunstrasen · Flutlicht',
    array['Hälfte A','Hälfte B'], 'Ganzer Platz', '[]');
  perform public._save_facility(p_club, null, 'Sportplatz 3', 'platz', '🏟️', 'Trainingsplatz · Kleinfelder',
    array['Viertel 1','Viertel 2','Viertel 3','Viertel 4'], 'Ganzer Platz',
    '[{"name":"Hälfte Nord","parts":["Viertel 1","Viertel 2"]},{"name":"Hälfte Süd","parts":["Viertel 3","Viertel 4"]}]');
  perform public._save_facility(p_club, null, 'Sporthalle 1', 'halle', '🏢', 'Dreifeldhalle',
    array['Feld 1','Feld 2','Feld 3'], 'Gesamte Halle', '[]');
  perform public._save_facility(p_club, null, 'Sporthalle 2', 'halle', '🏢', 'Zweifeldhalle mit Dojo-Boden',
    array['Feld 1','Feld 2'], 'Gesamte Halle', '[]');
  perform public._save_facility(p_club, null, 'Sportheim', 'heim', '🍻', 'Vereinsgaststätte',
    array['Saal','Nebenraum','Küche','Terrasse'], 'Ganzes Sportheim', '[]');
end $$;

create or replace function public.create_invite(p_club uuid, p_label text, p_role text, p_team uuid, p_single_use boolean, p_requires_approval boolean, p_days int default 30)
returns public.invites
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.invites;
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  insert into public.invites (club_id, code, label, role, requires_approval, expires_at, created_by)
  values (p_club, public._new_code(), coalesce(p_label, ''), p_role, true,
    now() + make_interval(days => greatest(1, least(p_days, 365))), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

drop function public.club_members(uuid);
create function public.club_members(p_club uuid)
returns table (user_id uuid, display_name text, role text, status text, email text, team_ids uuid[], created_at timestamptz, club_role text, department text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  return query
    select m.user_id, m.display_name, m.role, m.status, u.email::text,
      coalesce((select array_agg(t.team_id) from public.member_teams t
        where t.club_id = m.club_id and t.user_id = m.user_id), '{}'),
      m.created_at, m.club_role, m.department
    from public.members m join auth.users u on u.id = m.user_id
    where m.club_id = p_club
    order by (m.status = 'pending') desc, m.display_name;
end $$;

drop function public.update_member(uuid, uuid, text, text, uuid[]);
create function public.update_member(p_club uuid, p_user uuid, p_role text, p_status text, p_team_ids uuid[], p_club_role text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  if p_role <> 'admin' or p_status <> 'active' then perform public._assert_other_admin(p_club, p_user); end if;
  if p_role = 'admin' and p_status = 'active' and exists (select 1 from auth.users u where u.id = p_user and u.is_anonymous) then
    raise exception 'Diese Person muss erst eine E-Mail-Adresse hinterlegen.';
  end if;
  update public.members set role = p_role, status = p_status, club_role = coalesce(p_club_role, club_role)
    where club_id = p_club and user_id = p_user;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  delete from public.member_teams where club_id = p_club and user_id = p_user;
  insert into public.member_teams
    select p_club, p_user, t from unnest(coalesce(p_team_ids, '{}')) t;
end $$;

-- Rechte erneut setzen
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_active_member(uuid), public.is_admin(uuid), public.can_book(uuid, uuid),
  public.my_clubs(), public.club_data(uuid),
  public.join_club(text, text, text, text, uuid), public.create_club(text, text, text, boolean),
  public.rename_club(uuid, text), public.create_invite(uuid, text, text, uuid, boolean, boolean, int),
  public.club_members(uuid), public.update_member(uuid, uuid, text, text, uuid[], text),
  public.remove_member(uuid, uuid), public.delete_my_account(),
  public.save_facility(uuid, uuid, text, text, text, text, text[], text, jsonb),
  public.delete_facility(uuid, uuid)
to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Abteilung an die App liefern
create or replace function public.club_data(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_member(p_club) then
    raise exception 'Kein Zugriff auf diesen Verein.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'name', (select name from public.clubs where id = p_club),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'sport', t.sport, 'department', t.department, 'icon', t.icon, 'color', t.color, 'sort', t.sort
      ) order by t.sort, t.name) from public.teams t where t.club_id = p_club), '[]'::jsonb),
    'facilities', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'group', f.grp, 'icon', f.icon, 'name', f.name, 'desc', f.descr,
        'parts', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.sort)
                  from public.facility_parts p where p.facility_id = f.id),
        'units', (select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name,
                    'parts', (select jsonb_agg(up.part_id) from public.unit_parts up where up.unit_id = u.id))
                    order by u.sort)
                  from public.facility_units u where u.facility_id = f.id)
      ) order by f.sort, f.name) from public.facilities f where f.club_id = p_club), '[]'::jsonb)
  );
end $$;
