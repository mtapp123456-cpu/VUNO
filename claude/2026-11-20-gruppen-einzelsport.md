# 20.11.2026 – Gruppen für Einzelsportarten (Claude, Chat)

**Live:** gruendung.onbac.pages.dev (Cloudflare Pages, Projekt `onbac`, Preview-Zweig `gruendung`), Service-Worker-Cache `onbac-v109g`.
Grundlage war die Bereitstellung `80105779` (v108g, 44 Dateien). Neu: `gruppen-katalog.js`, `orgame-gruppen.js`;
geändert: `index.html` (2 Script-Tags nach `onbac-icons.js`), `sw.js` (Cache v109g + 2 Dateien). Alle anderen Dateien unverändert übernommen.

**Supabase:** `migration_18_gruppen.sql` im Projekt VUNO (sdnrmhjppvwiqudmugbm) ausgeführt – Spalten `teams.group_type, discipline, age_min, age_max, gender, level`, Tabelle `department_settings` (noch ungenutzt). Rückgängig-Block steht in der Datei.

**Funktion:** Einzelsport-Abteilungen auf der Teams-Seite: „+ Gruppe anlegen“ (Altersklasse / Leistungsgruppe / Kurs, Disziplin, Alter von–bis → Jahrgänge rücken am 1.1. weiter, Geschlecht, Stufe), Vorlagen aus dem Katalog (18 Sportarten, 154 Vorlagen), „Alle Vorlagen anlegen“ je Disziplin, Disziplin-Chips als Filter. Eine Gruppe ist eine Zeile in `teams` → 50 Plätze, 👍 ❓ 👎, Termine wie Mannschaften.

**Offen:** Mit eingeloggtem Verein noch nicht getestet (nur mit Beispieldaten). Produktion (onbac.pages.dev, v107) unverändert. Der übrige Live-Code liegt weiterhin nicht in GitHub.
