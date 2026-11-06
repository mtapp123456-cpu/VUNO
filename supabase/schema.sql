-- Vereins-App: Datenbankmodell für Supabase (Postgres)
-- Einmalig im SQL-Editor des Supabase-Projekts ausführen.
-- Alle Daten sind pro Verein getrennt und durch Row Level Security geschützt.

create extension if not exists btree_gist with schema extensions;

-- ========== Tabellen ==========

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 50),
  created_at timestamptz not null default now()
);

-- Freischaltcodes: Nur wer einen Code von dir hat, kann einen Verein anlegen.
create table public.signup_codes (
  code text primary key,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  club_id uuid references public.clubs(id) on delete set null
);

create table public.members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  role text not null default 'member' check (role in ('admin','trainer','member')),
  status text not null default 'pending' check (status in ('pending','active')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index members_user_idx on public.members(user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  sport text not null default '',
  icon text not null default '⚽',
  color text not null default '#16a34a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  unique (club_id, id),
  unique (club_id, name)
);

create table public.member_teams (
  club_id uuid not null,
  user_id uuid not null,
  team_id uuid not null,
  primary key (club_id, user_id, team_id),
  foreign key (club_id, user_id) references public.members(club_id, user_id) on delete cascade,
  foreign key (club_id, team_id) references public.teams(club_id, id) on delete cascade
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  grp text not null default 'platz' check (grp in ('platz','halle','heim')),
  icon text not null default '🏟️',
  name text not null check (length(trim(name)) between 1 and 50),
  descr text not null default '',
  sort int not null default 0,
  unique (club_id, id),
  unique (club_id, name)
);

-- Kleinste buchbare Fläche, z. B. „Viertel 1“
create table public.facility_parts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  facility_id uuid not null,
  name text not null,
  sort int not null default 0,
  unique (facility_id, name),
  foreign key (club_id, facility_id) references public.facilities(club_id, id) on delete cascade
);

-- Buchbarer Bereich, z. B. „Hälfte Nord“ = Viertel 1 + Viertel 2
create table public.facility_units (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  facility_id uuid not null,
  name text not null,
  sort int not null default 0,
  unique (facility_id, name),
  unique (club_id, facility_id, id),
  foreign key (club_id, facility_id) references public.facilities(club_id, id) on delete cascade
);

create table public.unit_parts (
  unit_id uuid not null references public.facility_units(id) on delete cascade,
  part_id uuid not null references public.facility_parts(id) on delete cascade,
  primary key (unit_id, part_id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null,
  facility_id uuid,
  unit_id uuid,
  title text not null check (length(trim(title)) between 1 and 60),
  date date not null,
  start_time time not null,
  end_time time not null,
  note text not null default '' check (length(note) <= 300),
  series_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((facility_id is null) = (unit_id is null)),
  foreign key (club_id, team_id) references public.teams(club_id, id) on delete restrict,
  foreign key (club_id, facility_id, unit_id) references public.facility_units(club_id, facility_id, id) on delete restrict
);
create index bookings_club_date_idx on public.bookings(club_id, date);
create index bookings_series_idx on public.bookings(series_id) where series_id is not null;

-- Belegte Teilflächen: Hier verhindert die Datenbank selbst jede Doppelbuchung.
create table public.booking_slots (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  part_id uuid not null references public.facility_parts(id) on delete cascade,
  during tsrange not null,
  primary key (booking_id, part_id),
  constraint keine_doppelbuchung exclude using gist (part_id with =, during with &&)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  code text not null unique,
  label text not null default '',
  role text not null default 'member' check (role in ('admin','trainer','member')),
  team_id uuid,
  requires_approval boolean not null default true,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Höhere Rollen nur über Einmal-Einladungen, nie über einen Aushang
  check (role = 'member' or coalesce(max_uses, 0) = 1),
  foreign key (club_id, team_id) references public.teams(club_id, id) on delete cascade
);
create index invites_club_idx on public.invites(club_id);

-- ========== Rechteprüfung ==========

create function public.is_active_member(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
    where m.club_id = p_club and m.user_id = auth.uid() and m.status = 'active');
$$;

create function public.is_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m
    where m.club_id = p_club and m.user_id = auth.uid() and m.status = 'active' and m.role = 'admin');
$$;

create function public.can_book(p_club uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(p_club) or exists (
    select 1 from public.members m
    join public.member_teams t on t.club_id = m.club_id and t.user_id = m.user_id
    where m.club_id = p_club and m.user_id = auth.uid() and m.status = 'active'
      and m.role = 'trainer' and t.team_id = p_team);
$$;

-- ========== Trigger für Buchungen ==========

create function public.bookings_sync_slots() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.club_id <> old.club_id then
      raise exception 'Der Verein einer Buchung kann nicht geändert werden.';
    end if;
    delete from public.booking_slots where booking_id = new.id;
  end if;
  if new.unit_id is not null then
    insert into public.booking_slots (booking_id, part_id, during)
    select new.id, up.part_id,
      tsrange(new.date + new.start_time, new.date + new.end_time, '[)')
    from public.unit_parts up where up.unit_id = new.unit_id;
  end if;
  return null;
end $$;

create trigger bookings_slots after insert or update on public.bookings
for each row execute function public.bookings_sync_slots();

-- ========== Row Level Security ==========

alter table public.clubs enable row level security;
alter table public.signup_codes enable row level security;
alter table public.members enable row level security;
alter table public.teams enable row level security;
alter table public.member_teams enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_parts enable row level security;
alter table public.facility_units enable row level security;
alter table public.unit_parts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_slots enable row level security;
alter table public.invites enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.bookings, public.teams, public.invites to authenticated;
grant insert, update, delete on public.bookings, public.teams to authenticated;
grant delete on public.invites to authenticated;

create policy teams_read on public.teams for select to authenticated
  using (public.is_active_member(club_id));
create policy teams_insert on public.teams for insert to authenticated
  with check (public.is_admin(club_id));
create policy teams_update on public.teams for update to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));
create policy teams_delete on public.teams for delete to authenticated
  using (public.is_admin(club_id));

create policy bookings_read on public.bookings for select to authenticated
  using (public.is_active_member(club_id));
create policy bookings_insert on public.bookings for insert to authenticated
  with check (public.can_book(club_id, team_id));
create policy bookings_update on public.bookings for update to authenticated
  using (public.can_book(club_id, team_id)) with check (public.can_book(club_id, team_id));
create policy bookings_delete on public.bookings for delete to authenticated
  using (public.can_book(club_id, team_id));

create policy invites_read on public.invites for select to authenticated
  using (public.is_admin(club_id));
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(club_id));

-- ========== Interne Hilfsfunktionen (nicht von außen aufrufbar) ==========

create function public._save_facility(
  p_club uuid, p_id uuid, p_name text, p_grp text, p_icon text, p_descr text,
  p_parts text[], p_whole text, p_combos jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_part text;
  v_i int := 0;
  v_unit uuid;
  v_units text[] := '{}';
  v_combo jsonb;
  v_sort int := 1;
  v_names text[];
begin
  select array_agg(distinct trim(x)) into v_names from unnest(p_parts) x where trim(x) <> '';
  if v_names is null then raise exception 'Bitte mindestens eine Teilfläche angeben.'; end if;
  if coalesce(array_length(v_names, 1), 0) <> (select count(*) from unnest(p_parts) x where trim(x) <> '') then
    raise exception 'Jede Teilfläche darf nur einmal vorkommen.';
  end if;

  if v_id is null then
    insert into public.facilities (club_id, grp, icon, name, descr, sort)
    values (p_club, p_grp, p_icon, trim(p_name), coalesce(p_descr, ''),
      (select coalesce(max(sort), 0) + 1 from public.facilities where club_id = p_club))
    returning id into v_id;
  else
    update public.facilities set grp = p_grp, icon = p_icon, name = trim(p_name), descr = coalesce(p_descr, '')
    where id = v_id and club_id = p_club;
    if not found then raise exception 'Anlage nicht gefunden.'; end if;
  end if;

  -- Teilflächen: bestehende behalten, neue anlegen
  foreach v_part in array p_parts loop
    if trim(v_part) = '' then continue; end if;
    v_i := v_i + 1;
    insert into public.facility_parts (club_id, facility_id, name, sort)
    values (p_club, v_id, trim(v_part), v_i)
    on conflict (facility_id, name) do update set sort = excluded.sort;
  end loop;

  -- Gewünschte Bereiche aufbauen
  create temporary table if not exists _wanted (name text primary key, parts text[], sort int) on commit drop;
  truncate _wanted;
  if array_length(v_names, 1) > 1 then
    insert into _wanted values (coalesce(nullif(trim(p_whole), ''), 'Gesamt'), v_names, 0);
  end if;
  for v_combo in select * from jsonb_array_elements(coalesce(p_combos, '[]'::jsonb)) loop
    v_sort := v_sort + 1;
    insert into _wanted values (
      trim(v_combo->>'name'),
      array(select trim(value) from jsonb_array_elements_text(v_combo->'parts')),
      v_sort
    ) on conflict (name) do nothing;
  end loop;
  v_i := 100;
  foreach v_part in array p_parts loop
    if trim(v_part) = '' then continue; end if;
    v_i := v_i + 1;
    insert into _wanted values (trim(v_part), array[trim(v_part)], v_i) on conflict (name) do nothing;
  end loop;
  if exists (select 1 from _wanted w, unnest(w.parts) p where not p = any(v_names)) then
    raise exception 'Ein Bereich verweist auf eine unbekannte Teilfläche.';
  end if;

  -- Entfallene Bereiche löschen (scheitert, solange dort Termine liegen)
  begin
    delete from public.facility_units u where u.facility_id = v_id
      and not exists (select 1 from _wanted w where w.name = u.name);
  exception when foreign_key_violation then
    raise exception 'Ein entfernter Bereich hat noch Termine. Bitte diese zuerst löschen.';
  end;

  for v_part, v_sort in select w.name, w.sort from _wanted w loop
    insert into public.facility_units (club_id, facility_id, name, sort)
    values (p_club, v_id, v_part, v_sort)
    on conflict (facility_id, name) do update set sort = excluded.sort
    returning id into v_unit;
    delete from public.unit_parts where unit_id = v_unit;
    insert into public.unit_parts (unit_id, part_id)
    select v_unit, p.id from public.facility_parts p, _wanted w, unnest(w.parts) n
    where w.name = v_part and p.facility_id = v_id and p.name = n;
  end loop;

  delete from public.facility_parts p where p.facility_id = v_id and not p.name = any(v_names);

  -- Bestehende Termine neu einordnen; Überschneidungen brechen die Änderung ab
  update public.bookings set unit_id = unit_id where facility_id = v_id;
  drop table _wanted;
  return v_id;
end $$;

create function public._seed_examples(p_club uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.teams (club_id, name, sport, icon, color, sort) values
    (p_club, '1. Mannschaft', 'Fußball · Herren', '⚽', '#16a34a', 1),
    (p_club, '2. Mannschaft', 'Fußball · Herren', '⚽', '#0284c7', 2),
    (p_club, 'Basketball', 'Abteilung Basketball', '🏀', '#ea580c', 3),
    (p_club, 'Kendo', 'Abteilung Kendo', '🥋', '#7c3aed', 4),
    (p_club, 'Verein', 'Vorstand & Veranstaltungen', '🍻', '#b45309', 5);
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

create function public._new_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 Zeichen, ohne I/O/0/1
  v_bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  v_code text := '';
  v_i int;
begin
  -- Bytes 6 und 8 einer UUID enthalten feste Bits und werden übersprungen
  foreach v_i in array array[0,1,2,3,4,5,9,10,11,12,13,14] loop
    v_code := v_code || substr(v_alpha, 1 + (get_byte(v_bytes, v_i) % 32), 1);
  end loop;
  return v_code;
end $$;

create function public._norm_code(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
$$;

-- ========== Funktionen für die App ==========

create function public.my_clubs()
returns table (club_id uuid, club_name text, role text, status text, display_name text, team_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select m.club_id, c.name, m.role, m.status, m.display_name,
    coalesce((select array_agg(t.team_id) from public.member_teams t
      where t.club_id = m.club_id and t.user_id = m.user_id), '{}')
  from public.members m join public.clubs c on c.id = m.club_id
  where m.user_id = auth.uid()
  order by c.name;
$$;

create function public.club_data(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_member(p_club) then
    raise exception 'Kein Zugriff auf diesen Verein.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'name', (select name from public.clubs where id = p_club),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'sport', t.sport, 'icon', t.icon, 'color', t.color, 'sort', t.sort
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

-- Für Noch-nicht-Angemeldete: zeigt nur den Vereinsnamen zu einem gültigen Code
create function public.invite_info(p_code text)
returns table (club_name text, role text, requires_approval boolean)
language sql stable security definer set search_path = '' as $$
  select c.name, i.role, i.requires_approval
  from public.invites i join public.clubs c on c.id = i.club_id
  where i.code = public._norm_code(p_code)
    and i.revoked_at is null and i.expires_at > now()
    and (i.max_uses is null or i.uses < i.max_uses);
$$;

create function public.join_club(p_code text, p_display_name text)
returns table (club_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invites;
  v_status text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 60 then
    raise exception 'Bitte deinen Namen angeben.';
  end if;
  select * into v_inv from public.invites where code = public._norm_code(p_code) for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    raise exception 'Diese Einladung ist nicht mehr gültig.' using errcode = 'P0002';
  end if;
  select m.status into v_existing from public.members m
    where m.club_id = v_inv.club_id and m.user_id = v_uid;
  if found then return query select v_inv.club_id, v_existing; return; end if;
  if v_inv.role <> 'member' and exists (
    select 1 from auth.users u where u.id = v_uid and u.is_anonymous
  ) then
    raise exception 'Für diese Einladung ist eine Anmeldung per E-Mail-Code nötig.' using errcode = 'P0003';
  end if;
  v_status := case when v_inv.requires_approval then 'pending' else 'active' end;
  insert into public.members (club_id, user_id, display_name, role, status)
  values (v_inv.club_id, v_uid, trim(p_display_name), v_inv.role, v_status);
  if v_inv.team_id is not null then
    insert into public.member_teams values (v_inv.club_id, v_uid, v_inv.team_id);
  end if;
  update public.invites set uses = uses + 1 where id = v_inv.id;
  return query select v_inv.club_id, v_status;
end $$;

create function public.create_club(p_signup_code text, p_club_name text, p_display_name text, p_with_examples boolean default false)
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
  insert into public.members (club_id, user_id, display_name, role, status)
  values (v_club, v_uid, trim(p_display_name), 'admin', 'active');
  update public.signup_codes set used_at = now(), used_by = v_uid, club_id = v_club
    where code = public._norm_code(p_signup_code);
  if p_with_examples then perform public._seed_examples(v_club); end if;
  return v_club;
end $$;

create function public.rename_club(p_club uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  update public.clubs set name = trim(p_name) where id = p_club;
end $$;

create function public.create_invite(p_club uuid, p_label text, p_role text, p_team uuid, p_single_use boolean, p_requires_approval boolean, p_days int default 30)
returns public.invites
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.invites;
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  insert into public.invites (club_id, code, label, role, team_id, requires_approval, max_uses, expires_at, created_by)
  values (p_club, public._new_code(), coalesce(p_label, ''), p_role, p_team, p_requires_approval,
    case when p_single_use then 1 end, now() + make_interval(days => greatest(1, least(p_days, 365))), auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create function public.club_members(p_club uuid)
returns table (user_id uuid, display_name text, role text, status text, email text, team_ids uuid[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  return query
    select m.user_id, m.display_name, m.role, m.status, u.email::text,
      coalesce((select array_agg(t.team_id) from public.member_teams t
        where t.club_id = m.club_id and t.user_id = m.user_id), '{}'),
      m.created_at
    from public.members m join auth.users u on u.id = m.user_id
    where m.club_id = p_club
    order by (m.status = 'pending') desc, m.display_name;
end $$;

create function public._assert_other_admin(p_club uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.members where club_id = p_club and user_id = p_user and role = 'admin' and status = 'active')
     and not exists (select 1 from public.members where club_id = p_club and user_id <> p_user and role = 'admin' and status = 'active') then
    raise exception 'Der Verein braucht mindestens einen Admin. Bitte zuerst einen weiteren Admin ernennen.';
  end if;
end $$;

create function public.update_member(p_club uuid, p_user uuid, p_role text, p_status text, p_team_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  if p_role <> 'admin' or p_status <> 'active' then perform public._assert_other_admin(p_club, p_user); end if;
  if p_role <> 'member' and exists (select 1 from auth.users u where u.id = p_user and u.is_anonymous) then
    raise exception 'Diese Person muss erst eine E-Mail-Adresse hinterlegen.';
  end if;
  update public.members set role = p_role, status = p_status where club_id = p_club and user_id = p_user;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  delete from public.member_teams where club_id = p_club and user_id = p_user;
  insert into public.member_teams
    select p_club, p_user, t from unnest(coalesce(p_team_ids, '{}')) t;
end $$;

create function public.remove_member(p_club uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) and p_user <> auth.uid() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  perform public._assert_other_admin(p_club, p_user);
  delete from public.members where club_id = p_club and user_id = p_user;
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select club_id from public.members where user_id = auth.uid() loop
    perform public._assert_other_admin(r.club_id, auth.uid());
  end loop;
  delete from auth.users where id = auth.uid();
end $$;

create function public.save_facility(p_club uuid, p_id uuid, p_name text, p_grp text, p_icon text, p_descr text, p_parts text[], p_whole text, p_combos jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  return public._save_facility(p_club, p_id, p_name, p_grp, p_icon, p_descr, p_parts, p_whole, p_combos);
end $$;

create function public.delete_facility(p_club uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  delete from public.facilities where id = p_id and club_id = p_club;
exception when foreign_key_violation then
  raise exception 'Diese Anlage hat noch Termine. Bitte diese zuerst löschen.';
end $$;

-- Rechte auf Funktionen: standardmäßig gesperrt, nur Benötigtes freigeben
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_active_member(uuid), public.is_admin(uuid), public.can_book(uuid, uuid),
  public.my_clubs(), public.club_data(uuid),
  public.join_club(text, text), public.create_club(text, text, text, boolean),
  public.rename_club(uuid, text), public.create_invite(uuid, text, text, uuid, boolean, boolean, int),
  public.club_members(uuid), public.update_member(uuid, uuid, text, text, uuid[]),
  public.remove_member(uuid, uuid), public.delete_my_account(),
  public.save_facility(uuid, uuid, text, text, text, text, text[], text, jsonb),
  public.delete_facility(uuid, uuid)
to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Live-Updates für Termine
alter publication supabase_realtime add table public.bookings;
