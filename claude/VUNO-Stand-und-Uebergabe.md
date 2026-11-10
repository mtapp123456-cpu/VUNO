# VUNO – Stand und Übergabe

Neue Einträge werden unten angefügt. Bestehende Einträge bleiben stehen.

## 10.11.2026 – Ladebildschirm und App-Icon (Claude, Chat)

**Letzter Stand im GitHub-Projekt (`main`):** Commit `d824bdb` (10.11., 08:46). Es ist kein neues ZIP entstanden, alles wurde direkt nach GitHub gepusht.

**Was geändert wurde**
- Ladebildschirm: Beim App-Start zeigt die App ca. 3 Sekunden das VUNO-Logo auf Schwarz und blendet es dann aus. (`app/index.html`, `app/style.css`, Commit `80dd25d`)
- Logo-Datei: `app/logo.png`. Das ist das VUNO-Logo (V-Zeichen, Schriftzug VUNO) mit dem Slogan „One Team, One App“ statt „Team & Orga“. Der Slogan wurde nachträglich ins Bild gesetzt, der Hintergrund ist reines Schwarz.
- App-Icon (Handy) und Browser-Tab-Symbol: nur das blaue V, ohne Schriftzug. (`app/icon-180.png`, `icon-192.png`, `icon-512.png`, Commits `6003a63` und `d824bdb`, in der zweiten Fassung mit dunkelblau-schwarzem Hintergrund)
- Service-Worker-Cache (`app/sw.js`) hochgesetzt, damit bereits installierte Geräte die neuen Dateien laden.

**Was offen ist**
- Der Ladebildschirm und die Icons wurden nur in einem Test-Chrome in Handygröße geprüft. Auf einem echten Handy ist es noch nicht angesehen worden.
- Handy-Icon: Auf Geräten mit installierter App ändert sich das Icon nur, wenn die App vom Homescreen gelöscht und neu hinzugefügt wird.
- Kopfzeile der App zeigt noch das alte 🏆 mit dem Vereinsnamen. Gewünscht ist das VUNO-Logo klein und sauber dort.
- Kontrolle bei Cloudflare, ob die neue Version wirklich ausgeliefert wird (Testversion: vuno-app.pages.dev).
- **Der GitHub-Stand ist älter als die Wunschliste.** In `main` fehlen laut Suche im Code u. a.: `openAccess` in `config.js` und `supabase/migration_5.sql` (Testverein offen ohne Anmeldung), Sportplatzbelegung mit zwei Reitern, Breaking-News-Banner, „App teilen“, Fahrergruppen für „Mitglieder & Fans“, Fußball-Reiter bis Bambini, Sportheim mit Speisekarte und Aktion, Begründung bei ❓/👎 und das Design „Dunkel & Leuchten“. Entweder liegen diese Teile in einer anderen Fassung oder ZIP außerhalb von GitHub oder sie sind noch nicht umgesetzt. Das muss geklärt werden, bevor weiter gebaut wird.
- Vor Live-Gang oder Übergabe an einen Verein: `openAccess` in `config.js` auf `false` und in Supabase `update public.clubs set open_access = false;` ausführen.
- Die Datei `claude/VUNO-Stand-und-Uebergabe.md` gab es im GitHub-Projekt noch nicht und wurde mit diesem Eintrag neu angelegt. Falls es sie an anderer Stelle schon gibt, den Eintrag dort einfügen.

## 10.11.2026 – Breaking-News-Banner, Nachtrag (Claude, Chat vom 07.11.)

**Letzter Stand:** Kein neues ZIP und keine neue Version im GitHub-Projekt. Am 07.11. hatte diese Sitzung keinen Zugriff auf GitHub, deshalb wurde nichts committet. Der Banner liegt nur als drei Einzeldateien vor, die dem Nutzer im Chat geschickt wurden: `migration_6.sql`, `news-banner.js`, `news-banner.css`. Dazu gibt es das Dokument „VUNO – Breaking-News-Banner“ (claude.ai-Artefakt) mit derselben Anleitung.

**Was gebaut wurde (noch nicht in `main`)**
- Breaking-News-Laufband auf der Startseite mit Meldungen aus allen Mannschaften. Posten dürfen nur Trainer und Admins, jede Meldung ist 48 Stunden sichtbar.
- `migration_6.sql`: Tabelle `public.breaking_news` (club_id, team_id, text max. 200 Zeichen, author_id, created_at), RLS-Regeln (Lesen nur der letzten 48 h, Anlegen und Löschen nur für `trainer`/`admin`), Realtime aktiviert.
- `news-banner.js`: legt Banner und Eingabefeld selbst an, Aufruf `VunoNews.init({ supabase, clubId, teamId, role })`, Live-Aktualisierung und alle 10 Minuten Neuladen.
- `news-banner.css`: rotes Laufband, Pause bei Berührung, ruhige Anzeige bei „Bewegung reduzieren“.

**Was offen ist**
- Dateien ins Repo übernehmen und den Aufruf in `app/index.html` bzw. `app/app.js` einbauen, danach `app/sw.js` (Cache) hochsetzen.
- Die Tabellennamen passen zu `supabase/schema.sql` (`members`, `user_id`, `club_id`, `role`). Die Regeln prüfen aber noch nicht `status = 'active'`, das sollte ergänzt werden. Prüfen, ob es `migration_5.sql` schon außerhalb von GitHub gibt, damit die Nummer 6 stimmt.
- Im offenen Testzugang ohne Anmeldung gibt es kein `auth.uid()`, dann kann niemand posten. Für den Test Meldungen direkt in Supabase eintragen.
- Wunsch aus dem Sprachanruf: Die Abstimmung 👍/👎/❓ soll in jeder Abteilung und jeder Mannschaft funktionieren, nicht nur in der ersten Mannschaft. Noch nicht umgesetzt.

## 10.11.2026 – Zurück-Pfeil auf der Breaking-News-Seite, Nachtrag (Claude, Chat vom 07.11.)

**Letzter Stand:** Kein ZIP und kein Commit im GitHub-Projekt. Die Änderung wurde am 07.11. um ca. 23:30 direkt bei Cloudflare als neue Bereitstellung des Projekts `vuno-app` hochgeladen (Deployment `00e8eb2d`, https://00e8eb2d.vuno-app.pages.dev, davor `2c86b07d`). Die drei geänderten Dateien liegen zusätzlich auf dem Rechner des Nutzers in `Desktop\VUNO-Logo-Update\Breaking-News-Zurueck-Update` (`vuno-zurueck.js`, `modern.css`, `sw.js`; die `index.html` dort ist eine ältere Fassung und gehört nicht dazu).

**Was geändert wurde**
- Zurück-Knopf (`vuno-zurueck.js`): nur noch ein kleiner runder Knopf mit Pfeil ‹, ohne das Wort „Zurück“.
- Der Knopf erscheint jetzt auch, wenn das Breaking-News-Fenster offen ist (erkannt an `#newsbox` im Fenster). Ein Tipp schließt das Fenster (`closeSheet()` aus `app.js`) und führt zur Startseite. Auf der Startseite selbst bleibt der Knopf ausgeblendet.
- `modern.css`: Knopf 40 × 40 px rund, über dem News-Fenster mit `z-index:60` (Klasse `over-sheet`), Abstand oben für `body.has-back` auf 50 px.
- `sw.js`: Cache von `vereins-app-v19` auf `vereins-app-v20`.
- Alle anderen Dateien der Bereitstellung wurden unverändert aus `2c86b07d` übernommen. Danach in der Live-App geprüft: Pfeil öffnet nicht auf der Startseite, erscheint in Breaking News, Tipp führt zu `#start`.

**Was offen ist**
- Die Live-Fassung bei Cloudflare (`vuno-app`, Direkt-Upload) ist deutlich neuer als `main` auf GitHub: Sie enthält z. B. das Breaking-News-Banner in `app.js` (Tabelle `news`, RPCs `post_news`/`delete_news`), `account.js`, `vuno-start.js` und `vuno-zurueck.js`. Diese Dateien sind nicht im Repo. Vor dem Weiterbauen die Live-Dateien ins Repo übernehmen, sonst geht beim nächsten Upload aus GitHub etwas verloren.
- Nur im Browser auf dem PC geprüft, noch nicht auf einem echten Handy.
- Auf dem Rechner gibt es danach noch den Ordner `Zurueck-Pfeil-fein-Update` (07.11., 23:36). Prüfen, ob dieser später hochgeladen wurde und die hier beschriebene Fassung ersetzt.
