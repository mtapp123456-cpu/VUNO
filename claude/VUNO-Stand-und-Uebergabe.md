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
