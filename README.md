# Zwischenraum MVP Free

Dieses Projekt ist die kostenlose Validierungsvariante von Zwischenraum.

Die App besteht aus:

- statischem Frontend in `public/`
- Supabase Auth fuer Login
- Supabase Postgres fuer echte Nutzerdaten
- Row Level Security fuer Rollen- und Mandantentrennung
- Brancheninterfaces und kundenspezifischem Branding

## Warum diese Variante?

Das MVP soll ohne Azure-Kosten testbar sein. Deshalb gibt es keinen eigenen Server. Die App kann spaeter auf GitHub Pages, Cloudflare Pages oder einem anderen Static Host veroeffentlicht werden. Die echte Daten- und Zugriffsschicht liegt in Supabase.

## Einmalige Supabase Einrichtung

1. Supabase Free Projekt erstellen.
2. In Supabase unter `SQL Editor` die Datei `supabase/schema.sql` ausfuehren.
3. In Supabase unter `Project Settings > API` die Project URL und den anon public Key kopieren.
4. `public/supabase-config.example.js` nach `public/supabase-config.js` kopieren und Werte eintragen.

Der Anon-Key ist oeffentlich. Die Sicherheit kommt aus den Policies in `supabase/schema.sql`.

## Lokal starten

```powershell
npm run dev
```

Falls PowerShell `npm.ps1` wegen Ausfuehrungsrichtlinien blockiert:

```powershell
npm.cmd run dev
```

Oder direkt:

```powershell
node server.mjs
```

Dann oeffnen:

```text
http://127.0.0.1:5177
```

## Kernfunktionen

- Account erstellen und einloggen
- Login mit E-Mail und Passwort
- Registrierung nur ueber Einladungslink
- Workspace-Erstellung ist standardmaessig gesperrt und nur fuer bewusstes Setup aktivierbar
- Branche waehlen
- Branding anpassen
- Clients oder Coaches per vorbereiteter E-Mail einladen
- Coach erstellt Aufgaben
- Client sieht eigene Aufgaben
- Client schliesst Aufgaben mit verpflichtender Reflexion und Status ab
- Coach sieht Fortschritt und Reflexionen
- Coach oeffnet ein Client-Profil mit offenen, ueberfaelligen und erledigten Aufgaben
- Coach erstellt private Notizen, die nur fuer ihn sichtbar sind

## Wichtige Grenze fuer echte Kundentests

Diese Free-MVP-Version ist geeignet fuer Validierung und reale Workflows mit vorsichtigem Datenumfang. Fuer Psychotherapie, Gesundheitsdaten oder sehr sensible Reflexionen sollte vor produktivem Einsatz eine Datenschutz- und Rechtspruefung erfolgen.
