-- Änderung 4: Teilnahme an Terminen (👍 ja / ❓ vielleicht / 👎 nein) und höchstens 50 Spieler je Mannschaft
-- Einmalig im SQL-Editor von Supabase ausführen (nach schema.sql, migration_2.sql, migration_3.sql).

-- ========== Höchstens 50 Spieler je Mannschaft ==========
create function public.member_teams_player_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.members m
             where m.club_id = new.club_id and m.user_id = new.user_id and m.club_role = 'spieler') then
    -- Mannschaft sperren, damit zwei gleichzeitige Beitritte die Grenze nicht überschreiten
    perform 1 from public.teams where id = new.team_id for update;
    if (select count(*) from public.member_teams mt
        join public.members m on m.club_id = mt.club_id and m.user_id = mt.user_id
        where mt.team_id = new.team_id and m.club_role = 'spieler' and mt.user_id <> new.user_id) >= 50 then
      raise exception 'Diese Mannschaft hat bereits 50 Spieler.';
    end if;
  end if;
  return new;
end $$;
create trigger member_teams_player_limit before insert on public.member_teams
for each row execute function public.member_teams_player_limit();

-- ========== Teilnahme ==========
create table public.attendance (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  club_id uuid not null,
  user_id uuid not null,
  status text not null check (status in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (booking_id, user_id),
  foreign key (club_id, user_id) references public.members(club_id, user_id) on delete cascade
);
create index attendance_club_idx on public.attendance(club_id);
alter table public.attendance enable row level security;
-- Lesen dürfen aktive Mitglieder des Vereins (nötig für Live-Updates); schreiben nur über set_attendance
revoke all on public.attendance from anon, authenticated;
grant select on public.attendance to authenticated;
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_active_member(club_id));

create function public._booking_ended(p_date date, p_end time) returns boolean
language sql stable set search_path = '' as $$
  select (p_date + p_end) <= (now() at time zone 'Europe/Berlin');
$$;

-- Eigene Teilnahme setzen; Trainer der Mannschaft und Admins dürfen sie auch für andere setzen.
-- p_status = null löscht die Angabe.
create function public.set_attendance(p_booking uuid, p_status text, p_user uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid := coalesce(p_user, auth.uid());
  v_b public.bookings;
  v_manager boolean;
begin
  if v_uid is null then raise exception 'Bitte zuerst anmelden.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('yes','maybe','no') then
    raise exception 'Unbekannte Antwort.';
  end if;
  select * into v_b from public.bookings where id = p_booking;
  if not found or not public.is_active_member(v_b.club_id) then
    raise exception 'Termin nicht gefunden.' using errcode = 'P0002';
  end if;
  v_manager := public.can_book(v_b.club_id, v_b.team_id);
  if v_target <> v_uid and not v_manager then
    raise exception 'Nur Trainer dieser Mannschaft und Admins dürfen das für andere eintragen.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.member_teams mt join public.members m
                   on m.club_id = mt.club_id and m.user_id = mt.user_id
                 where mt.club_id = v_b.club_id and mt.team_id = v_b.team_id
                   and mt.user_id = v_target and m.status = 'active') then
    raise exception 'Nur Mitglieder dieser Mannschaft können zu- oder absagen.' using errcode = 'P0001';
  end if;
  if not v_manager and public._booking_ended(v_b.date, v_b.end_time) then
    raise exception 'Dieser Termin ist schon vorbei.' using errcode = 'P0001';
  end if;
  if p_status is null then
    delete from public.attendance where booking_id = p_booking and user_id = v_target;
  else
    insert into public.attendance (booking_id, club_id, user_id, status, updated_at, updated_by)
    values (p_booking, v_b.club_id, v_target, p_status, now(), v_uid)
    on conflict (booking_id, user_id) do update
      set status = excluded.status, updated_at = now(), updated_by = v_uid;
  end if;
end $$;

-- Namensliste eines Termins: alle aktiven Mitglieder der Mannschaft mit ihrer Antwort
create function public.booking_attendance(p_booking uuid)
returns table (user_id uuid, display_name text, club_role text, status text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking;
  if not found or not public.is_active_member(v_b.club_id) then
    raise exception 'Termin nicht gefunden.' using errcode = 'P0002';
  end if;
  return query
    select m.user_id, m.display_name, m.club_role, a.status, a.updated_at
    from public.member_teams mt
    join public.members m on m.club_id = mt.club_id and m.user_id = mt.user_id and m.status = 'active'
    left join public.attendance a on a.booking_id = p_booking and a.user_id = m.user_id
    where mt.club_id = v_b.club_id and mt.team_id = v_b.team_id
    order by (m.club_role = 'trainer') desc, m.display_name;
end $$;

-- Zähler für alle Termine eines Zeitraums, dazu die eigene Antwort
create function public.attendance_overview(p_club uuid, p_from date, p_to date)
returns table (booking_id uuid, yes int, maybe int, no int, open int, mine text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_member(p_club) then
    raise exception 'Kein Zugriff auf diesen Verein.' using errcode = '42501';
  end if;
  return query
    select b.id,
      count(*) filter (where a.status = 'yes')::int,
      count(*) filter (where a.status = 'maybe')::int,
      count(*) filter (where a.status = 'no')::int,
      count(m.user_id) filter (where a.status is null)::int,
      max(a.status) filter (where m.user_id = auth.uid())
    from public.bookings b
    join public.member_teams mt on mt.club_id = b.club_id and mt.team_id = b.team_id
    join public.members m on m.club_id = mt.club_id and m.user_id = mt.user_id and m.status = 'active'
    left join public.attendance a on a.booking_id = b.id and a.user_id = m.user_id
    where b.club_id = p_club and b.date between p_from and p_to
    group by b.id;
end $$;

-- Spielerzahl je Mannschaft für die App
create or replace function public.club_data(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_member(p_club) then
    raise exception 'Kein Zugriff auf diesen Verein.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'name', (select name from public.clubs where id = p_club),
    'brand_color', (select brand_color from public.clubs where id = p_club),
    'header_color', (select header_color from public.clubs where id = p_club),
    'logo', (select logo from public.clubs where id = p_club),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'sport', t.sport, 'department', t.department, 'icon', t.icon, 'color', t.color, 'sort', t.sort,
        'players', (select count(*) from public.member_teams mt
                    join public.members m on m.club_id = mt.club_id and m.user_id = mt.user_id
                    where mt.team_id = t.id and m.club_role = 'spieler' and m.status = 'active')
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

revoke execute on function public.member_teams_player_limit(), public._booking_ended(date, time),
  public.set_attendance(uuid, text, uuid), public.booking_attendance(uuid),
  public.attendance_overview(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.set_attendance(uuid, text, uuid), public.booking_attendance(uuid),
  public.attendance_overview(uuid, date, date)
  to authenticated;

-- Live-Updates: Zu- und Absagen kommen sofort bei allen an (die App lädt dann die Zähler neu)
alter publication supabase_realtime add table public.attendance;
