# Vereins-App einrichten

Inhalt: `app/` (die Web-App) und `schema.sql` (die Datenbank).

## 1. Supabase-Projekt
1. Projekt bei supabase.com anlegen, Region **Frankfurt (eu-central-1)**.
2. Im **SQL Editor** den Inhalt von `schema.sql` einfügen und ausführen.
3. Unter **Authentication > Sign In / Providers** aktivieren: **Email** und **Allow anonymous sign-ins** (für den Beitritt per QR-Code ohne E-Mail).
4. Unter **Authentication > Email Templates** in den Vorlagen **Magic Link** und **Change Email Address** statt des Links den Code einsetzen: `Dein Code: {{ .Token }}`
5. Für echte Tests einen Mailanbieter unter **Authentication > SMTP Settings** eintragen. Der eingebaute Versand ist stark begrenzt.

## 2. App veröffentlichen
1. In `app/config.js` die Project URL und den öffentlichen Schlüssel (`anon` / `publishable`) eintragen, dazu die Links zu Impressum und Datenschutz. **Niemals** den `service_role`- bzw. `secret`-Schlüssel verwenden.
2. Den Ordner `app/` bei einem statischen Hoster hochladen, z. B. Cloudflare Pages oder Netlify. HTTPS ist Pflicht.
3. In Supabase unter **Authentication > URL Configuration** die Adresse der App als Site URL eintragen.

## 3. Ersten Verein anlegen
Pro Verein einen Freischaltcode im SQL Editor erzeugen (Großbuchstaben und Ziffern):

    insert into public.signup_codes (code, note) values ('PILOT2026', 'SV Beispiel');

Der Vorstand öffnet die App, meldet sich per E-Mail-Code an und legt mit diesem Code den Verein an. Danach unter Einstellungen > Verwaltung Teams, Anlagen und QR-Codes pflegen.

## Rollen
- **Admin / Vorstand:** alles
- **Trainer / Abteilungsleitung:** bucht für zugewiesene Teams
- **Mitglied:** nur ansehen

## Einladungen
- **Aushang-QR-Code:** mehrfach nutzbar, nur Rolle Mitglied, Freigabe durch Admin nötig
- **Einzel-QR-Code:** einmal nutzbar für Trainer oder Vorstand, E-Mail-Anmeldung nötig
