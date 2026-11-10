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

## 10.11.2026 – Zurück-Pfeil, Banner auf jeder Seite, Foto-Kacheln (Claude, Chat vom 07./08.11.)

**Letzter Stand:** Live auf **vuno-app.pages.dev** (Cloudflare Pages, Projekt `vuno-app`, Direkt-Upload, kein GitHub). Letzte Bereitstellung am 08.11. gegen 00:15 Uhr, Service-Worker-Cache `vereins-app-v24`. **Nichts davon ist in GitHub `main`.**
- Letztes ZIP als Datei: `Downloads\vuno-upload-7.zip` auf dem PC des Nutzers (Stand v21: Zurück-Pfeil + Banner auf jeder Seite, noch ohne Foto-Kacheln).
- Die drei späteren Bereitstellungen (Namen intern `vuno-upload-8/9/10.zip`, v22–v24) wurden direkt im Browser aus der Live-Fassung gebaut und hochgeladen. Als Datei gibt es sie nicht. **Die vollständige aktuelle Fassung ist nur die Live-Seite** – zum Sichern alle Dateien von vuno-app.pages.dev herunterladen (Liste unten).
- Zur offenen Frage im Eintrag davor: Der Ordner `Desktop\VUNO-Logo-Update\Zurueck-Pfeil-fein-Update` ist ein Zwischenstand dieser Sitzung. Sein Inhalt steckt in `vuno-upload-7.zip` (v21) und wurde hochgeladen. Er ersetzt die Fassung `00e8eb2d` und ist inzwischen selbst durch v22–v24 überholt.
- Grundlage war die Live-Fassung vom 07.11. (Cloudflare-Bereitstellung `00e8eb2d`). Sie ist neuer als `Desktop\VUNO-Logo-Update\Breaking-News-Zurueck-Update` und neuer als GitHub (enthält z. B. Kachel „anstehende Spiele“ in `vuno-start.js`, Breaking News, Fahrergruppen, `openAccess`).

**Was geändert wurde**
- Zurück-Pfeil (`vuno-zurueck.js`, `modern.css`): kleiner und feiner (30 px statt 40 px, dünnere Linie, weißer Knopf mit Pfeil in Vereinsfarbe). Er schwebt nicht mehr, sondern steht in einer eigenen Zeile direkt unter der Kopfzeile und überdeckt keine Logos oder Banner mehr. Sichtbar auf jeder Seite außer der Startseite. Nur im Breaking-News-Fenster schwebt er weiter darüber.
- Neue Datei `vuno-seiten.js` (in `index.html` nach `vuno-start.js` eingebunden): Breaking-News-Laufband und rotes Vereinsbanner (Vereinsname, Datum, drei Kacheln) stehen jetzt oben auf **jeder** Seite, nicht nur auf der Startseite.
- Startseiten-Kacheln als Bild-Buttons: Fußball, Basketball, Kendo, Turnen, Verein & Kalender, Mitglieder & Fans, Sportplatzbelegung, Sportheim zeigen ein KI-Foto mit dunklem Verlauf und weißer Schrift (`vuno-seiten.js`, `modern.css`, Klasse `tile-photo`). Bilder in `img/fussball.jpg`, `basketball.jpg`, `kendo.jpg`, `turnen.jpg`, `verein.jpg`, `fans.jpg`, `platz.jpg`, `heim.jpg` (640×400, je ca. 30–50 KB). Die Zuordnung läuft über den Kachelnamen.
- Die Fotos wurden mit Workers AI im Cloudflare-Konto des Nutzers erzeugt (Modell `flux-1-schnell`). Fußball, Basketball, Turnen, Verein und Fans wurden auf Wunsch **neutral** neu erzeugt, also ohne Vereinsfarben, damit sie zu jeder Vereinsfarbe passen.
- Dateien der Live-Fassung: `index.html`, `style.css`, `modern.css`, `app.js`, `account.js`, `config.js`, `manifest.webmanifest`, `sw.js`, `vendor/qrcode.js`, `vuno-logo-kopf.png`, `icon-180/192/512.png`, `vuno-start.js`, `vuno-zurueck.js`, `vuno-seiten.js`, `img/*.jpg` (8 Bilder).

**Was offen ist**
- **Live-Fassung nach GitHub übernehmen.** GitHub `main` und die Live-Seite laufen auseinander. Vor weiteren Änderungen klären, welche Fassung die führende ist, sonst gehen Teile verloren.
- „Werbung“ wurde als Breaking-News-Laufband verstanden, weil es keine Werbefläche gibt. Falls echte Werbe- oder Sponsorenbanner gemeint sind, ist das noch nicht umgesetzt.
- Vereinsfarben lassen sich schon in den Einstellungen ändern (Hauptfarbe, Kopfzeile, Logo, `update_club_branding`). Angeboten, aber noch nicht umgesetzt: Jeder Verein lädt eigene Fotos für die Kacheln hoch.
- Kachel „Verein & Kalender“: Auf dem KI-Foto steht am Wandkalender unleserlicher Fantasietext. Bei Bedarf neu erzeugen.
- Die Foto-Kacheln greifen nur bei genau diesen Kachelnamen. Neue oder umbenannte Abteilungen bekommen noch kein Foto.
- Nur im Browser in Handygröße geprüft, noch nicht auf einem echten Handy.
- Weiterhin vor Live-Gang: `openAccess` in `config.js` auf `false` und in Supabase `update public.clubs set open_access = false;`.
