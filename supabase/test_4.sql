-- Prüft Änderung 4 (Teilnahme, 50 Spieler). Läuft nach test.sql, nutzt dessen Hilfsfunktionen t() und t_err().
\set ON_ERROR_STOP on
\set QUIET on
insert into auth.users(id,email,is_anonymous) values
 ('00000000-0000-0000-0000-0000000004a1','vorstand@x.de',false),
 ('00000000-0000-0000-0000-0000000004a2','trainer@x.de',false),
 ('00000000-0000-0000-0000-0000000004a3','spieler1@x.de',false),
 ('00000000-0000-0000-0000-0000000004a4',null,true),
 ('00000000-0000-0000-0000-0000000004a5','fremd@x.de',false),
 ('00000000-0000-0000-0000-0000000004a6','anderes@x.de',false);
insert into public.signup_codes(code) values ('T4CLUB'),('T4OTHER');

set role authenticated;
do $$
declare
  vs uuid:='00000000-0000-0000-0000-0000000004a1'; tr uuid:='00000000-0000-0000-0000-0000000004a2';
  s1 uuid:='00000000-0000-0000-0000-0000000004a3'; s2 uuid:='00000000-0000-0000-0000-0000000004a4';
  fr uuid:='00000000-0000-0000-0000-0000000004a5'; an uuid:='00000000-0000-0000-0000-0000000004a6';
  club uuid; other uuid; t1 uuid; t2 uuid; inv public.invites; bk uuid; past uuid; bk2 uuid; r record; n int;
begin
  perform set_config('request.jwt.claim.sub', vs::text, false);
  club := create_club('T4CLUB','TSV Teilnahme','Vorstand',true);
  select (x->>'id')::uuid into t1 from jsonb_array_elements(club_data(club)->'teams') x where x->>'name'='1. Mannschaft';
  select (x->>'id')::uuid into t2 from jsonb_array_elements(club_data(club)->'teams') x where x->>'name'='Kendo';
  inv := create_invite(club,'Aushang','member',null,false,true);

  perform set_config('request.jwt.claim.sub', tr::text, false);
  perform join_club(inv.code,'Tina Trainer','trainer','Fußball',t1);
  perform set_config('request.jwt.claim.sub', s1::text, false);
  perform join_club(inv.code,'Sam Spieler','spieler','Fußball',t1);
  perform set_config('request.jwt.claim.sub', s2::text, false);
  perform join_club(inv.code,'Paul Platzhalter','spieler','Fußball',t1);
  perform set_config('request.jwt.claim.sub', fr::text, false);
  perform join_club(inv.code,'Fritz Kendo','spieler','Kendo',t2);

  perform set_config('request.jwt.claim.sub', vs::text, false);
  perform update_member(club,tr,'trainer','active',array[t1],'trainer');
  perform update_member(club,s1,'member','active',array[t1],'spieler');
  perform update_member(club,fr,'member','active',array[t2],'spieler');
  -- s2 bleibt unbestätigt

  insert into bookings(club_id,team_id,title,date,start_time,end_time)
    values (club,t1,'Training',current_date + 3,'18:00','19:30') returning id into bk;
  insert into bookings(club_id,team_id,title,date,start_time,end_time)
    values (club,t1,'Altes Training',current_date - 3,'18:00','19:30') returning id into past;
  insert into bookings(club_id,team_id,title,date,start_time,end_time)
    values (club,t2,'Kendo',current_date + 3,'18:00','19:30') returning id into bk2;

  perform t('Spielerzahl wird geliefert (nur aktive Spieler)',
    (select (x->>'players')::int from jsonb_array_elements(club_data(club)->'teams') x where (x->>'id')::uuid=t1)=1);

  -- Spieler sagt zu
  perform set_config('request.jwt.claim.sub', s1::text, false);
  perform set_attendance(bk,'yes');
  select * into r from attendance_overview(club,current_date,current_date+30) where booking_id=bk;
  perform t('Zusage wird gezählt', r.yes=1 and r.maybe=0 and r.no=0 and r.open=1 and r.mine='yes', row_to_json(r)::text);
  perform set_attendance(bk,'maybe');
  select * into r from attendance_overview(club,current_date,current_date+30) where booking_id=bk;
  perform t('Antwort lässt sich ändern', r.yes=0 and r.maybe=1 and r.mine='maybe');
  perform set_attendance(bk,null);
  select * into r from attendance_overview(club,current_date,current_date+30) where booking_id=bk;
  perform t('Antwort lässt sich zurücknehmen', r.open=2 and r.mine is null);
  perform t_err('Unbekannte Antwort abgelehnt', format($q$select set_attendance(%L,'egal')$q$,bk),'Unbekannte Antwort');
  perform t_err('Nicht für fremde Mannschaft', format($q$select set_attendance(%L,'yes')$q$,bk2),'Nur Mitglieder dieser Mannschaft');
  perform t_err('Spieler nicht für andere', format($q$select set_attendance(%L,'yes',%L)$q$,bk,tr),'Nur Trainer');
  perform t_err('Vergangener Termin für Spieler gesperrt', format($q$select set_attendance(%L,'yes')$q$,past),'schon vorbei');
  perform t_err('Kein direktes Schreiben in die Tabelle',
    format($q$insert into attendance(booking_id,club_id,user_id,status) values (%L,%L,%L,'yes')$q$,bk,club,s1),'42501');

  -- Trainer
  perform set_config('request.jwt.claim.sub', tr::text, false);
  perform set_attendance(bk,'no',s1);
  perform set_attendance(bk,'yes');
  perform set_attendance(past,'yes',s1);
  perform t('Trainer trägt für Spieler und vergangene Termine ein',
    (select status from attendance where booking_id=bk and user_id=s1)='no'
    and (select status from attendance where booking_id=past and user_id=s1)='yes');
  perform t_err('Trainer nicht für fremde Mannschaft', format($q$select set_attendance(%L,'yes',%L)$q$,bk2,fr),'Nur Trainer');
  perform t_err('Unbestätigte zählen nicht', format($q$select set_attendance(%L,'yes',%L)$q$,bk,s2),'Nur Mitglieder dieser Mannschaft');

  select count(*) into n from booking_attendance(bk);
  perform t('Namensliste: nur aktive Mannschaftsmitglieder', n=2, n::text);
  perform t('Namensliste: Trainer zuerst, mit Antwort',
    (select display_name||'='||status from booking_attendance(bk) limit 1)='Tina Trainer=yes');

  -- Kendo-Spieler darf die Liste sehen (gleicher Verein), aber nicht abstimmen
  perform set_config('request.jwt.claim.sub', fr::text, false);
  perform t('Vereinsmitglied sieht Namensliste', (select count(*) from booking_attendance(bk))=2);
  perform t('Vereinsmitglied liest Tabelle (Live-Updates)', (select count(*) from attendance where booking_id=bk)=2);

  -- Fremder Verein
  perform set_config('request.jwt.claim.sub', an::text, false);
  other := create_club('T4OTHER','Anderer Verein','Andere',false);
  perform t_err('Fremder Verein: keine Übersicht', format('select * from attendance_overview(%L,current_date,current_date+30)',club),'Kein Zugriff');
  perform t_err('Fremder Verein: keine Namensliste', format('select * from booking_attendance(%L)',bk),'nicht gefunden');
  perform t_err('Fremder Verein: kein Abstimmen', format($q$select set_attendance(%L,'yes')$q$,bk),'nicht gefunden');
  perform t('Fremder Verein: Tabelle leer', (select count(*) from attendance)=0);

  -- Termin löschen entfernt die Antworten
  perform set_config('request.jwt.claim.sub', vs::text, false);
  delete from bookings where id=past;
  perform set_config('request.jwt.claim.sub', tr::text, false);
  perform t('Löschen des Termins entfernt Antworten', not exists(select 1 from attendance where booking_id=past));
end $$;
reset role;

-- Obergrenze 50 Spieler je Mannschaft (Trainer zählen nicht)
do $$
declare c uuid; tm uuid; i int; u uuid;
begin
  select id into c from public.clubs where name='TSV Teilnahme';
  select id into tm from public.teams where club_id=c and name='2. Mannschaft';
  for i in 1..50 loop
    u := gen_random_uuid(); insert into auth.users(id,email) values (u, 'p'||i||'@t4.de');
    insert into public.members(club_id,user_id,display_name,role,status,club_role) values (c,u,'P'||i,'member','active','spieler');
    insert into public.member_teams values (c,u,tm);
  end loop;
  u := gen_random_uuid(); insert into auth.users(id,email) values (u, 'coach@t4.de');
  insert into public.members(club_id,user_id,display_name,role,status,club_role) values (c,u,'Coach','trainer','active','trainer');
  insert into public.member_teams values (c,u,tm);
  perform public.t('Trainer zählt nicht zu den 50 Spielern', true);
  u := gen_random_uuid(); insert into auth.users(id,email) values (u, 'p51@t4.de');
  insert into public.members(club_id,user_id,display_name,role,status,club_role) values (c,u,'P51','member','active','spieler');
  begin
    insert into public.member_teams values (c,u,tm);
    perform public.t('51. Spieler wird abgelehnt', false, 'kein Fehler');
  exception when others then
    perform public.t('51. Spieler wird abgelehnt', sqlerrm like '%50 Spieler%', sqlerrm);
  end;
end $$;

\echo
\echo Teilnahme:
select case when ok then 'OK  ' else 'FAIL' end as r, name, case when ok then '' else info end as info
from public.t_res where n > (select coalesce(max(n),0) from public.t_res where name like 'Elfter%') order by n;
select count(*) filter (where ok) as bestanden, count(*) filter (where not ok) as fehlgeschlagen from public.t_res;
