-- Test für migration_einladung_rechte.sql
-- Läuft komplett in einem Block und wird am Ende IMMER zurückgerollt (es bleibt nichts in der Datenbank).
-- Das Ergebnis steht in der Fehlermeldung „TESTERGEBNIS …“.
do $$
declare
  v_club uuid; v_adm uuid; v_t1 uuid; v_t2 uuid; v_platz uuid; v_halle uuid; v_unitp uuid; v_unith uuid;
  u_tr uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  v_res text := ''; v_ok int := 0; v_fail int := 0; v jsonb; v_code text; v_code2 text; v_bool boolean; v_role text;
begin
  select c.id into v_club from public.clubs c where c.open_access order by c.created_at limit 1;
  select m.user_id into v_adm from public.members m where m.club_id = v_club and m.role = 'admin' and m.status = 'active' limit 1;
  select t.id into v_t1 from public.teams t where t.club_id = v_club and t.name !~* 'fans' order by t.sort, t.name limit 1;
  select t.id into v_t2 from public.teams t where t.club_id = v_club and t.name !~* 'fans' and t.id <> v_t1 order by t.sort, t.name limit 1;
  select f.id into v_platz from public.facilities f where f.club_id = v_club and f.grp = 'platz' limit 1;
  select f.id into v_halle from public.facilities f where f.club_id = v_club and f.grp = 'halle' limit 1;
  select u.id into v_unitp from public.facility_units u where u.facility_id = v_platz order by u.sort limit 1;
  select u.id into v_unith from public.facility_units u where u.facility_id = v_halle order by u.sort limit 1;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-' || x || '@example.invalid', now(), now()
  from unnest(array[u_tr, u1, u2, u3]) x;
  insert into public.members (club_id, user_id, display_name, role, status, club_role) values (v_club, u_tr, 'Test Trainer', 'trainer', 'active', 'trainer');
  insert into public.member_teams (club_id, user_id, team_id) values (v_club, u_tr, v_t1);

  -- 1) Admin lädt U1 ein: Plätze + Einladen für Mannschaft 1
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);
  v := public.orgame_einladung_erstellen(v_club, 'Test Eins', array['platz', 'einladen'], array[v_t1]);
  v_code := v->>'code';
  if v_code is not null then v_ok := v_ok + 1; v_res := v_res || ' | 1 ok Admin erstellt Einladung'; else v_fail := v_fail + 1; v_res := v_res || ' | 1 FEHLER'; end if;

  -- 2) U1 nimmt an
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  v := public.orgame_einladung_annehmen(v_code, 'Test Eins');
  select role into v_role from public.members where club_id = v_club and user_id = u1;
  if v_role = 'member' and public.orgame_darf(v_club, 'platz', v_t1) and public.orgame_darf(v_club, 'einladen', null) and not public.orgame_darf(v_club, 'halle', v_t1)
  then v_ok := v_ok + 1; v_res := v_res || ' | 2 ok U1 hat genau Plätze+Einladen'; else v_fail := v_fail + 1; v_res := v_res || ' | 2 FEHLER ' || v::text; end if;

  -- 3) Zweites Einlösen derselben Einladung durch U3 scheitert
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u3::text, true);
  begin
    perform public.orgame_einladung_annehmen(v_code, 'Dritter');
    v_fail := v_fail + 1; v_res := v_res || ' | 3 FEHLER zweimal eingelöst';
  exception when others then v_ok := v_ok + 1; v_res := v_res || ' | 3 ok nur einmal einlösbar';
  end;

  -- 4) U1 versucht Hallen weiterzugeben -> abgelehnt
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  begin
    perform public.orgame_einladung_erstellen(v_club, 'Test Zwei', array['halle'], array[v_t1]);
    v_fail := v_fail + 1; v_res := v_res || ' | 4 FEHLER Halle erlaubt';
  exception when others then v_ok := v_ok + 1; v_res := v_res || ' | 4 ok Halle abgelehnt';
  end;
  -- 5) U1 versucht fremde Mannschaft -> abgelehnt
  begin
    perform public.orgame_einladung_erstellen(v_club, 'Test Zwei', array['platz'], array[v_t2]);
    v_fail := v_fail + 1; v_res := v_res || ' | 5 FEHLER Mannschaft 2 erlaubt';
  exception when others then v_ok := v_ok + 1; v_res := v_res || ' | 5 ok fremde Mannschaft abgelehnt';
  end;
  -- 6) Gemischt (erlaubt + verboten) -> komplett abgelehnt, keine Einladung angelegt
  begin
    perform public.orgame_einladung_erstellen(v_club, 'Test Zwei', array['platz', 'sportheim'], array[v_t1]);
    v_fail := v_fail + 1; v_res := v_res || ' | 6 FEHLER gemischt erlaubt';
  exception when others then
    if not exists (select 1 from public.rights_invites where name = 'Test Zwei') then v_ok := v_ok + 1; v_res := v_res || ' | 6 ok gemischt komplett abgelehnt';
    else v_fail := v_fail + 1; v_res := v_res || ' | 6 FEHLER teilweise angelegt'; end if;
  end;
  -- 7) U1 gibt Plätze für Mannschaft 1 weiter -> erlaubt (Kette)
  v := public.orgame_einladung_erstellen(v_club, 'Test Zwei', array['platz'], array[v_t1]);
  v_code2 := v->>'code';
  if v_code2 is not null then v_ok := v_ok + 1; v_res := v_res || ' | 7 ok Kette erlaubt'; else v_fail := v_fail + 1; v_res := v_res || ' | 7 FEHLER'; end if;

  -- 8) Admin entzieht U1 das Platzrecht, bevor U2 einlöst -> U2 bekommt es nicht
  delete from public.member_rights where club_id = v_club and user_id = u1 and recht = 'platz';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  v := public.orgame_einladung_annehmen(v_code2, 'Test Zwei');
  if (v->>'gekappt')::int >= 1 and not public.orgame_darf(v_club, 'platz', v_t1) then v_ok := v_ok + 1; v_res := v_res || ' | 8 ok entzogenes Recht gekappt';
  else v_fail := v_fail + 1; v_res := v_res || ' | 8 FEHLER ' || v::text; end if;
  -- Platzrecht für U1 zurück, U2 direkt Platzrecht geben (für Buchungstests)
  insert into public.member_rights (club_id, user_id, recht, team_id) values (v_club, u2, 'platz', v_t1);

  -- 9) U2 darf für Mannschaft 1 buchen, nicht für Mannschaft 2
  if public.can_book(v_club, v_t1) and not public.can_book(v_club, v_t2) then v_ok := v_ok + 1; v_res := v_res || ' | 9 ok can_book nur eigene Mannschaft';
  else v_fail := v_fail + 1; v_res := v_res || ' | 9 FEHLER can_book'; end if;
  -- 10) U2 bucht Platz -> ok; Halle -> abgelehnt
  if v_platz is not null then
    begin
      insert into public.bookings (club_id, team_id, facility_id, unit_id, title, date, start_time, end_time)
      values (v_club, v_t1, v_platz, v_unitp, 'Test', current_date + 400, '06:00', '06:30');
      v_ok := v_ok + 1; v_res := v_res || ' | 10a ok Platz gebucht';
    exception when others then v_fail := v_fail + 1; v_res := v_res || ' | 10a FEHLER ' || sqlerrm; end;
  end if;
  if v_halle is not null then
    begin
      insert into public.bookings (club_id, team_id, facility_id, unit_id, title, date, start_time, end_time)
      values (v_club, v_t1, v_halle, v_unith, 'Test', current_date + 400, '06:00', '06:30');
      v_fail := v_fail + 1; v_res := v_res || ' | 10b FEHLER Halle gebucht';
    exception when others then v_ok := v_ok + 1; v_res := v_res || ' | 10b ok Halle abgelehnt: ' || sqlerrm; end;
  end if;
  -- 11) U2 hat kein News-Recht
  begin
    perform public.post_news(v_club, v_t1, 'Test');
    v_fail := v_fail + 1; v_res := v_res || ' | 11 FEHLER News erlaubt';
  exception when others then v_ok := v_ok + 1; v_res := v_res || ' | 11 ok News abgelehnt';
  end;
  -- 12) Testverein: U2 wird beim Start NICHT Admin
  perform public.join_open_club();
  select role into v_role from public.members where club_id = v_club and user_id = u2;
  if v_role = 'member' then v_ok := v_ok + 1; v_res := v_res || ' | 12 ok bleibt Mitglied'; else v_fail := v_fail + 1; v_res := v_res || ' | 12 FEHLER wurde ' || v_role; end if;
  -- 13) Alter Trainer (ohne Einladerecht) kann nicht einladen, behält aber seine Rechte
  perform set_config('request.jwt.claims', json_build_object('sub', u_tr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_tr::text, true);
  v_bool := public.orgame_darf(v_club, 'halle', v_t1) and public.orgame_darf(v_club, 'news', v_t1) and public.can_book(v_club, v_t1);
  begin
    perform public.orgame_einladung_erstellen(v_club, 'X', array['platz'], array[v_t1]);
    v_fail := v_fail + 1; v_res := v_res || ' | 13 FEHLER Trainer darf einladen';
  exception when others then
    if v_bool then v_ok := v_ok + 1; v_res := v_res || ' | 13 ok Trainer wie bisher, ohne Einladen'; else v_fail := v_fail + 1; v_res := v_res || ' | 13 FEHLER Trainerrechte'; end if;
  end;
  -- 14) Einladung ansehen ohne Anmeldung
  v := public.orgame_einladung_info(v_code);
  if (v->>'ok')::boolean and v->>'status' = 'eingelöst' then v_ok := v_ok + 1; v_res := v_res || ' | 14 ok Info'; else v_fail := v_fail + 1; v_res := v_res || ' | 14 FEHLER ' || v::text; end if;

  raise exception 'TESTERGEBNIS: % bestanden, % Fehler %', v_ok, v_fail, v_res;
end $$;
