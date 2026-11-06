-- Prüft das Modell auf einer lokalen Postgres-Instanz. Nicht in Supabase ausführen.
\set ON_ERROR_STOP on
\set QUIET on
create function pg_temp.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text,''), false)
$$;
create table if not exists public.t_res(n serial, name text, ok boolean, info text);
grant all on public.t_res, public.t_res_n_seq to authenticated, anon;

create or replace function public.t(name text, ok boolean, info text default '') returns void language sql as $$
  insert into public.t_res(name, ok, info) values (name, ok, info)
$$;
-- Führt SQL aus und erwartet einen Fehler mit passendem Text
create or replace function public.t_err(name text, q text, want text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    perform public.t(name, (sqlerrm || ' ' || sqlstate) ilike '%'||want||'%', sqlstate||': '||sqlerrm);
    return;
  end;
  perform public.t(name, false, 'kein Fehler');
end $$;
grant execute on function public.t(text,boolean,text), public.t_err(text,text,text) to authenticated, anon;

insert into auth.users(id,email,is_anonymous) values
 ('00000000-0000-0000-0000-00000000000a','a@x.de',false),
 ('00000000-0000-0000-0000-00000000000b','b@x.de',false),
 ('00000000-0000-0000-0000-00000000000c',null,true),
 ('00000000-0000-0000-0000-00000000000d','d@x.de',false),
 ('00000000-0000-0000-0000-00000000000e',null,true);
insert into public.signup_codes(code) values ('START1'),('START2');

set role authenticated;
do $$
declare
  a uuid:='00000000-0000-0000-0000-00000000000a'; b uuid:='00000000-0000-0000-0000-00000000000b';
  c uuid:='00000000-0000-0000-0000-00000000000c'; d uuid:='00000000-0000-0000-0000-00000000000d';
  e uuid:='00000000-0000-0000-0000-00000000000e';
  club1 uuid; club2 uuid; v jsonb; fac jsonb; t1 uuid; t2 uuid; ug uuid; un uuid; us uuid; uv1 uuid;
  inv public.invites; inv2 public.invites; cnt int; bk uuid; st text; f3 uuid; club2team uuid;
begin
  perform set_config('request.jwt.claim.sub', a::text, false);
  perform t_err('Verein ohne gültigen Code', $q$select create_club('FALSCH','X','A',false)$q$, 'nicht gültig');
  club1 := create_club('start-1','SV Test','Anna',true);
  perform t('Freischaltcode wird angenommen', club1 is not null);
  perform t_err('Freischaltcode nur einmal', $q$select create_club('START1','Y','A',false)$q$, 'nicht gültig');

  v := club_data(club1);
  perform t('Beispieldaten: 5 Teams, 6 Anlagen', jsonb_array_length(v->'teams')=5 and jsonb_array_length(v->'facilities')=6);
  select f into fac from jsonb_array_elements(v->'facilities') f where f->>'name'='Sportplatz 3';
  f3 := (fac->>'id')::uuid;
  perform t('Platz 3 hat 7 Bereiche', jsonb_array_length(fac->'units')=7);
  select (x->>'id')::uuid into ug from jsonb_array_elements(fac->'units') x where x->>'name'='Ganzer Platz';
  select (x->>'id')::uuid into un from jsonb_array_elements(fac->'units') x where x->>'name'='Hälfte Nord';
  select (x->>'id')::uuid into us from jsonb_array_elements(fac->'units') x where x->>'name'='Hälfte Süd';
  select (x->>'id')::uuid into uv1 from jsonb_array_elements(fac->'units') x where x->>'name'='Viertel 1';
  select (x->>'id')::uuid into t1 from jsonb_array_elements(v->'teams') x where x->>'name'='1. Mannschaft';
  select (x->>'id')::uuid into t2 from jsonb_array_elements(v->'teams') x where x->>'name'='Kendo';

  -- Konfliktschutz
  insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
    values (club1,t1,f3,un,'Training','2030-01-07','18:00','19:30') returning id into bk;
  perform t('Buchung Hälfte Nord klappt', bk is not null);
  perform t_err('Überlappung Ganzer Platz wird abgelehnt',
    format($q$insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
      values (%L,%L,%L,%L,'X','2030-01-07','19:00','20:00')$q$,club1,t1,f3,ug),'23P01');
  perform t_err('Überlappung Viertel 1 wird abgelehnt',
    format($q$insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
      values (%L,%L,%L,%L,'X','2030-01-07','18:30','18:45')$q$,club1,t1,f3,uv1),'23P01');
  insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
    values (club1,t1,f3,us,'Parallel','2030-01-07','18:00','19:30');
  perform t('Hälfte Süd gleichzeitig ist erlaubt', true);
  insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
    values (club1,t1,f3,un,'Anschluss','2030-01-07','19:30','20:30');
  perform t('Direkter Anschluss ist erlaubt', true);
  perform t_err('Serie ist ganz oder gar nicht',
    format($q$insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time) values
      (%1$L,%2$L,%3$L,%4$L,'S','2030-01-14','18:00','19:00'),(%1$L,%2$L,%3$L,%4$L,'S','2030-01-07','18:00','19:00')$q$,club1,t1,f3,un),'23P01');
  select count(*) into cnt from bookings where title='S';
  perform t('Nach Fehler kein Serienrest', cnt=0, cnt::text);
  perform t_err('Update in belegte Zeit wird abgelehnt',
    format($q$update bookings set start_time='19:00', end_time='20:00' where id=%L$q$,bk),'23P01');
  update bookings set title='Training neu', start_time='17:00', end_time='18:00' where id=bk;
  perform t('Update auf freie Zeit klappt', true);
  perform t_err('Ende vor Beginn',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-02-01','20:00','19:00')$q$,club1,t1),'check');

  -- Einladungen
  inv := create_invite(club1,'Aushang','member',null,false,true);
  perform t('Einladungscode hat 12 Zeichen', inv.code ~ '^[A-HJ-NP-Z2-9]{12}$', inv.code);
  perform t('Code ist zufällig', inv.code <> (create_invite(club1,'x','member',null,false,true)).code);
  inv2 := create_invite(club1,'Admins','admin',null,false,true);

  -- anonymer QR-Beitritt
  perform set_config('request.jwt.claim.sub', c::text, false);
  select status into st from join_club(lower(substr(inv.code,1,4))||'-'||substr(inv.code,5),'Carl');
  perform t('QR-Beitritt ohne E-Mail: wartet auf Freigabe', st='pending', st);
  perform t('Wartende sehen keine Termine', (select count(*) from bookings)=0);
  perform t_err('Wartende sehen keine Vereinsdaten', format('select club_data(%L)',club1),'Kein Zugriff');
  perform set_config('request.jwt.claim.sub', e::text, false);
  perform t_err('Anonym kein Admin per QR', format('select join_club(%L,%L)',inv2.code,'E'),'E-Mail-Code');
  perform set_config('request.jwt.claim.sub', c::text, false);
  perform t_err('Anonym kein Verein anlegbar', $q$select create_club('START2','Z','C',false)$q$,'E-Mail-Code');

  perform set_config('request.jwt.claim.sub', a::text, false);
  perform t_err('Anonym nicht zum Admin ernennbar', format($q$select update_member(%L,%L,'admin','active','{}')$q$,club1,c),'E-Mail');
  perform update_member(club1,c,'member','active','{}');
  perform set_config('request.jwt.claim.sub', c::text, false);
  perform t('Nach Freigabe sichtbar', (select count(*) from bookings)>0);
  perform t_err('Mitglied darf nicht buchen',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-03-01','10:00','11:00')$q$,club1,t1),'row-level');
  update bookings set title='Hack' where id=bk;
  perform t('Mitglied kann Termine nicht ändern', (select title from bookings where id=bk)='Training neu');
  delete from bookings where id=bk;
  perform t('Mitglied kann Termine nicht löschen', exists(select 1 from bookings where id=bk));
  perform t_err('Mitglied sieht Mitgliederliste nicht', format('select club_members(%L)',club1),'Nur für Admins');
  perform t('Mitglied sieht keine Einladungen', (select count(*) from invites)=0);

  -- Trainer
  perform set_config('request.jwt.claim.sub', b::text, false);
  perform t_err('Trainer ohne Mannschaft abgelehnt', format($q$select join_club(%L,'Berta','trainer','Fußball',null)$q$,inv.code),'Mannschaft');
  select status into st from join_club(inv.code,'Berta','trainer','Fußball',t1);
  perform t('Trainer wartet auf Bestätigung', st='pending', st);
  perform t_err('Trainer bucht vor Bestätigung nicht',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-03-02','10:00','11:00')$q$,club1,t1),'row-level');
  perform set_config('request.jwt.claim.sub', a::text, false);
  perform t('Admin sieht Rolle und Abteilung', exists(select 1 from club_members(club1) where display_name='Berta' and club_role='trainer' and department='Fußball' and role='trainer' and status='pending'));
  perform update_member(club1,b,'trainer','active',array[t1]);
  perform set_config('request.jwt.claim.sub', d::text, false);
  select status into st from join_club(inv2.code,'Dora Admin','vorstand','',null);
  perform t('Admin-QR wartet ebenfalls auf Bestätigung', st='pending', st);
  perform t('Wartender Admin hat keine Rechte', not is_admin(club1));
  perform remove_member(club1,d);
  perform set_config('request.jwt.claim.sub', b::text, false);
  insert into bookings(club_id,team_id,title,date,start_time,end_time) values (club1,t1,'Trainer eigen','2030-03-01','10:00','11:00');
  perform t('Trainer bucht eigenes Team', true);
  perform t_err('Trainer bucht fremdes Team nicht',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-03-01','10:00','11:00')$q$,club1,t2),'row-level');

  -- Mandantentrennung
  perform set_config('request.jwt.claim.sub', d::text, false);
  club2 := create_club('START2','FC Anders','Dora',false);
  perform t('Anderer Verein sieht keine fremden Termine', (select count(*) from bookings)=0);
  perform t('Anderer Verein sieht keine fremden Teams', (select count(*) from teams where club_id=club1)=0);
  perform t_err('Kein Zugriff auf fremde Vereinsdaten', format('select club_data(%L)',club1),'Kein Zugriff');
  perform t_err('Keine Einladung für fremden Verein', format($q$select create_invite(%L,'x','member',null,false,true)$q$,club1),'Nur für Admins');
  perform t_err('Keine Buchung in fremdem Verein',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-03-01','10:00','11:00')$q$,club1,t1),'row-level');
  insert into teams(club_id,name) values (club2,'Team') returning id into club2team;
  perform t_err('Fremdes Team im eigenen Verein geht nicht',
    format($q$insert into bookings(club_id,team_id,title,date,start_time,end_time) values (%L,%L,'X','2030-03-01','10:00','11:00')$q$,club2,t1),'foreign key');
  insert into bookings(club_id,team_id,title,date,start_time,end_time) values (club2,club2team,'Eigen','2030-03-01','10:00','11:00');

  -- Keine direkten Tabellenrechte auf interne Daten
  perform t_err('Mitgliedertabelle nicht direkt lesbar','select * from members','permission denied');
  perform t_err('Freischaltcodes nicht lesbar','select * from signup_codes','permission denied');
  perform t_err('Interne Funktion gesperrt', format($q$select _seed_examples(%L)$q$,club2),'permission denied');

  -- Anlagen pflegen
  perform set_config('request.jwt.claim.sub', a::text, false);
  perform t_err('Bereich mit Terminen nicht entfernbar',
    format($q$select save_facility(%L,%L,'Sportplatz 3','platz','🏟️','',array['Viertel 1','Viertel 2','Viertel 3','Viertel 4'],'Ganzer Platz','[]')$q$,club1,f3),'noch Termine');
  perform save_facility(club1,f3,'Sportplatz 3 neu','platz','🏟️','Neu',array['Viertel 1','Viertel 2','Viertel 3','Viertel 4'],'Ganzer Platz',
    '[{"name":"Hälfte Nord","parts":["Viertel 1","Viertel 2"]},{"name":"Hälfte Süd","parts":["Viertel 3","Viertel 4"]}]');
  perform t('Anlage umbenennen behält Bereiche', jsonb_array_length((select f->'units' from jsonb_array_elements(club_data(club1)->'facilities') f where f->>'id'=f3::text))=7);
  perform t_err('Konfliktschutz gilt nach Bearbeitung',
    format($q$insert into bookings(club_id,team_id,facility_id,unit_id,title,date,start_time,end_time)
      values (%L,%L,%L,%L,'X','2030-01-07','19:45','20:00')$q$,club1,t1,f3,ug),'23P01');
  perform t_err('Anlage mit Terminen nicht löschbar', format('select delete_facility(%L,%L)',club1,f3),'noch Termine');
  perform save_facility(club1,null,'Halle Neu','halle','🏢','',array['Feld'],'','[]');
  perform t('Neue Anlage mit einer Fläche', (select jsonb_array_length(f->'units') from jsonb_array_elements(club_data(club1)->'facilities') f where f->>'name'='Halle Neu')=1);
  perform t_err('Team mit Terminen nicht löschbar', format('delete from teams where id=%L',t1),'23503');

  -- Admin-Schutz, Konto löschen
  perform t_err('Letzter Admin nicht entfernbar', format('select remove_member(%L,%L)',club1,a),'mindestens einen Admin');
  perform t_err('Letzter Admin nicht herabstufbar', format($q$select update_member(%L,%L,'member','active','{}')$q$,club1,a),'mindestens einen Admin');
  perform t_err('Letzter Admin kann Konto nicht löschen', 'select delete_my_account()','mindestens einen Admin');
  perform set_config('request.jwt.claim.sub', c::text, false);
  perform delete_my_account();
  perform t('Mitglied kann eigenes Konto löschen', (select count(*) from my_clubs())=0);
end $$;
reset role;

select public.t('Konto wirklich entfernt', not exists(select 1 from auth.users where id='00000000-0000-0000-0000-00000000000c'));
\echo
select case when ok then 'OK  ' else 'FAIL' end as r, name, case when ok then '' else info end as info from public.t_res order by n;
select count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as fehlgeschlagen from public.t_res;
-- Obergrenze: zehn aktive Admins
do $$
declare c uuid; i int; u uuid;
begin
  select club_id into c from public.members where role='admin' limit 1;
  for i in 1..11 loop
    u := gen_random_uuid(); insert into auth.users(id,email) values (u, i||'@a.de');
    begin
      insert into public.members(club_id,user_id,display_name,role,status) values (c,u,'A'||i,'admin','active');
    exception when others then
      perform public.t('Elfter Admin wird abgelehnt', sqlerrm like '%zehn Admins%' and (select count(*) from public.members where club_id=c and role='admin' and status='active')=10, sqlerrm);
      return;
    end;
  end loop;
  perform public.t('Elfter Admin wird abgelehnt', false, 'kein Fehler');
end $$;
select case when ok then 'OK  ' else 'FAIL' end as r, name, info from public.t_res where name like 'Elfter%' and not ok;
select count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as fehlgeschlagen from public.t_res;
