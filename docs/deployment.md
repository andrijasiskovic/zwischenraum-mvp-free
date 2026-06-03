# Veroeffentlichung

## Empfohlener Weg fuer das Free MVP

Frontend:

- Cloudflare Pages oder GitHub Pages
- Inhalt des Ordners `public/`

Backend:

- Supabase Free
- SQL aus `supabase/schema.sql`

## GitHub Pages

GitHub Pages kann statische Dateien aus einem Repository veroeffentlichen. Fuer dieses Projekt muss der Inhalt aus `public/` veroeffentlicht werden.

Wichtig: `public/supabase-config.js` enthaelt den oeffentlichen Supabase-Anon-Key. Das ist bei Supabase normal. Keine Service-Role-Keys in diese Datei schreiben.

## Cloudflare Pages

Cloudflare Pages ist fuer dieses Projekt meistens angenehmer, weil ein statischer Ordner direkt veroeffentlicht werden kann.

Build command:

```text
kein Build notwendig
```

Output directory:

```text
public
```

## Spaeterer Wechsel

Wenn das MVP validiert ist, kann dieselbe Produktlogik in eine robustere SaaS-Architektur ueberfuehrt werden:

- Supabase Pro oder Azure PostgreSQL
- eigene API
- E-Mail-Reminder
- Audit-Logs
- Analytics
- AI-Funktionen
