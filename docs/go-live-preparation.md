# Go-Live Vorbereitung fuer MVP-Test

Dieses Dokument beschreibt die Schritte, die erst ausgefuehrt werden, wenn der Betreiber bereit ist.

## 1. Supabase pruefen

Vor dem Teststart:

- aktuelles `supabase/schema.sql` im Supabase SQL Editor ausfuehren
- keine SQL-Fehler
- Authentication Email Provider pruefen
- fuer MVP-Test entscheiden:
  - Confirm email aus fuer geringere Reibung
  - oder Confirm email an fuer realistischere Sicherheit
- anon public key und Project URL in `public/supabase-config.js` pruefen

## 2. Lokalen Abschlusstest machen

Lokal starten:

```powershell
cd "C:\Users\andri\Documents\Codex\2026-05-29\ich-sende-dir-hier-unseren-gemeinsamen\zwischenraum-mvp-free"
npm.cmd run dev
```

Oeffnen:

```text
http://127.0.0.1:5177
```

Testen:

- Betreiber-Login
- Coach einladen
- Coach registriert sich mit Branchenwahl
- Coach bekommt eigenen Workspace
- Coach laedt Client ein
- Client registriert sich
- Coach erstellt Aufgabe
- Client schliesst Aufgabe ab
- Coach sieht Reflexion
- Client entfernen
- Reminder Center
- Branding
- Templates
- Mein Profil

## 3. Hosting vorbereiten

Empfehlung fuer kostenlosen MVP-Test:

- GitHub Repository
- Cloudflare Pages
- Ausgabeordner: `public`
- kein Build Command noetig

Cloudflare Pages Einstellungen:

```text
Build command: leer lassen
Output directory: public
```

## 4. Nach Veroeffentlichung testen

Mit der echten Online-URL:

- Einladungslink muss Online-URL enthalten, nicht `127.0.0.1`
- Gmail/Outlook/GMX/WEB.DE Links pruefen
- Registrierung mit neuem Coach testen
- Registrierung mit Client testen

## 5. Testbetrieb starten

Erst danach:

- 3 bis 5 Testcoaches einladen
- Testzeitraum starten
- Feedbacktermine vereinbaren
