-- Änderung 3: Vereinsfarben und Vereinslogo
alter table public.clubs add column brand_color text not null default '#166534'
  check (brand_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.clubs add column header_color text not null default '#14532d'
  check (header_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.clubs add column logo text
  check (logo is null or (length(logo) <= 300000 and logo ~ '^data:image/(png|webp);base64,[A-Za-z0-9+/=]+$'));

create function public.update_club_branding(p_club uuid, p_brand text, p_header text, p_logo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_club) then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  update public.clubs set brand_color = p_brand, header_color = p_header, logo = p_logo where id = p_club;
exception when check_violation then
  raise exception 'Diese Farbe oder dieses Logo kann nicht gespeichert werden.';
end $$;
revoke execute on function public.update_club_branding(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_club_branding(uuid, text, text, text) to authenticated;

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
