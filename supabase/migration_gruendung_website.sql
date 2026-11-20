-- Verein gründen auf www.orga.me (auch im Testmodus ?test=1)
-- Die Website legt nach bestätigtem E-Mail-Code den Verein mit Abteilungen,
-- Anlagen (inkl. Teilflächen) und Haupt-Admin an und übergibt dann an die App.
-- Bestehende Tabellen und Funktionen bleiben unverändert.

create table if not exists public.club_setup (
  club_id uuid primary key references public.clubs on delete cascade,
  quelle text not null default 'website',
  test boolean not null default false,
  setup jsonb not null default '{}',
  bestellung jsonb not null default '{}',
  admin jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.club_setup enable row level security;
drop policy if exists club_setup_admin_read on public.club_setup;
create policy club_setup_admin_read on public.club_setup for select using (public.is_admin(club_id));

create or replace function public.create_club_from_website(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_v jsonb := coalesce(p->'verein', '{}'::jsonb);
  v_name text;
  v_color text;
  v_logo text;
  v_a jsonb;
  v_n int;
  v_i int;
  v_t int;
  v_parts text[];
  v_whole text;
  v_combos jsonb;
  v_fn text;
  v_typ text;
  v_count int;
begin
  if v_uid is null or exists (select 1 from auth.users u where u.id = v_uid and u.is_anonymous) then
    raise exception 'Bitte zuerst die E-Mail-Adresse bestätigen.' using errcode = '42501';
  end if;

  -- Schutz vor Missbrauch: höchstens 5 Gründungen je Konto und Tag
  select count(*) into v_count
    from public.club_setup s
    join public.members m on m.club_id = s.club_id and m.user_id = v_uid and m.role = 'admin'
   where s.created_at > now() - interval '1 day';
  if v_count >= 5 then
    raise exception 'Zu viele Vereine in kurzer Zeit angelegt. Bitte später erneut versuchen.';
  end if;

  v_name := left(trim(coalesce(v_v->>'name', '')), 50);
  if length(v_name) < 2 then
    raise exception 'Bitte einen Vereinsnamen angeben.';
  end if;

  v_color := coalesce(nullif(v_v->>'farbe', ''), '#1E90FF');
  if v_color !~ '^#[0-9a-fA-F]{6}$' then v_color := '#1E90FF'; end if;

  v_logo := nullif(v_v->>'wappen', '');
  if v_logo is not null and (length(v_logo) > 300000 or v_logo !~ '^data:image/(png|webp);base64,[A-Za-z0-9+/=]+$') then
    v_logo := null;
  end if;

  insert into public.clubs (name, brand_color, header_color, logo)
  values (v_name, v_color, v_color, v_logo)
  returning id into v_club;

  insert into public.members (club_id, user_id, display_name, role, status, club_role)
  values (v_club, v_uid, left(coalesce(nullif(trim(p->'admin'->>'name'), ''), 'Haupt-Admin'), 60), 'admin', 'active', 'vorstand');

  insert into public.departments (club_id, name)
  select v_club, left(trim(x->>'name'), 60)
    from jsonb_array_elements(coalesce(p->'setup'->'abteilungen', '[]'::jsonb)) x
   where trim(coalesce(x->>'name', '')) <> '';

  for v_a in select * from jsonb_array_elements(coalesce(p->'setup'->'anlagen', '[]'::jsonb)) loop
    v_n := least(greatest(coalesce((v_a->>'anzahl')::int, 1), 1), 20);
    v_t := coalesce((v_a->>'aufteilung')::int, 1);
    v_typ := coalesce(v_a->>'typ', 'a');
    if v_t = 4 then
      v_parts := array['Viertel 1', 'Viertel 2', 'Viertel 3', 'Viertel 4']; v_whole := 'Gesamt';
      v_combos := '[{"name":"Hälfte 1","parts":["Viertel 1","Viertel 2"]},{"name":"Hälfte 2","parts":["Viertel 3","Viertel 4"]}]';
    elsif v_t = 3 then
      v_parts := array['Drittel 1', 'Drittel 2', 'Drittel 3']; v_whole := 'Gesamt'; v_combos := '[]';
    elsif v_t = 2 then
      v_parts := array['Hälfte 1', 'Hälfte 2']; v_whole := 'Gesamt'; v_combos := '[]';
    else
      v_parts := array['Gesamt']; v_whole := ''; v_combos := '[]';
    end if;
    for v_i in 1..v_n loop
      v_fn := left(trim(coalesce(v_a->>'name', '')), 56) || case when v_n > 1 then ' ' || v_i else '' end;
      if trim(v_fn) = '' then continue; end if;
      if exists (select 1 from public.facilities f where f.club_id = v_club and lower(f.name) = lower(v_fn)) then continue; end if;
      perform public._save_facility(
        v_club, null, v_fn,
        case when v_typ = 'p' then 'platz' else 'halle' end,
        '',
        case v_typ when 'g' then 'Gebäude' when 'p' then 'Platz' when 'r' then 'Raum' else 'Anlage' end,
        v_parts, v_whole, v_combos);
    end loop;
  end loop;

  update public.club_license set valid_until = (now() + interval '30 days')::date where club_id = v_club;
  if not found then
    insert into public.club_license (club_id, valid_until) values (v_club, (now() + interval '30 days')::date);
  end if;

  insert into public.club_setup (club_id, test, setup, bestellung, admin)
  values (
    v_club,
    coalesce((p->>'test')::boolean, false),
    coalesce(p->'setup', '{}'::jsonb),
    coalesce(p->'bestellung', '{}'::jsonb),
    jsonb_build_object(
      'name', p->'admin'->>'name',
      'email', (select u.email from auth.users u where u.id = v_uid),
      'telefon', p->'admin'->>'telefon',
      'ort', v_v->>'ort',
      'land', v_v->>'land',
      'zustimmung', now()
    )
  );

  return v_club;
end
$$;

revoke all on function public.create_club_from_website(jsonb) from public, anon;
grant execute on function public.create_club_from_website(jsonb) to authenticated;
