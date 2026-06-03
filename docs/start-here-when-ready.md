# Start hier, wenn du wieder am Laptop bist

Wenn der MVP-Test gestartet werden soll, arbeiten wir diese Reihenfolge ab.

## Nicht vorher ausfuehren

Noch nichts veroeffentlichen, keine echten Testkunden einladen, bevor die Punkte unten gemeinsam geprueft sind.

## Start-Reihenfolge

1. Supabase SQL aktualisieren
   - aktuellen Inhalt von `supabase/schema.sql` im Supabase SQL Editor ausfuehren

2. Lokalen Funktionstest machen
   - App lokal starten
   - Betreiber-Login testen
   - Coach-Einladung testen
   - Client-Einladung testen

3. Hosting entscheiden
   - empfohlen: Cloudflare Pages
   - Alternative: GitHub Pages

4. Repository vorbereiten
   - Code in GitHub ablegen
   - keine privaten Supabase Service Keys speichern
   - anon public key ist okay

5. Online deployen
   - `public` als statischen Ordner veroeffentlichen

6. Online-End-to-End-Test
   - Coach-Link muss Online-URL enthalten
   - Client-Link muss Online-URL enthalten
   - Registrierung und Login mit neuen E-Mail-Adressen testen

7. Testcoaches einladen
   - nur Coaches einladen
   - Coaches laden ihre Clients selbst ein

## Vor dem ersten echten Testcoach klaeren

- Welche Branche testet der Coach?
- Darf der Coach echte Clients einladen?
- Hinweis: keine sensiblen Gesundheits-/Therapiedaten im MVP-Test
- Feedbacktermin vereinbaren

## Wichtige Erinnerung

Die Branchen-Testumschaltung ist nur fuer den Betreiber vorgesehen. Vor breiterer Veroeffentlichung pruefen, ob sie entfernt oder gesperrt bleibt.
