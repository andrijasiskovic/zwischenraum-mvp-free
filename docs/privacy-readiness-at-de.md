# Datenschutz-Checkliste für die Testphase in AT/DE

Stand: 05.06.2026

Hinweis: Das ist eine technische und organisatorische Arbeitsgrundlage, keine Rechtsberatung. Vor produktivem Einsatz mit echten Gesundheits-, Therapie- oder Patientendaten sollte eine juristische Prüfung erfolgen.

## Ausgangslage für die morgige Testphase

Aktuell testen wir die Plattform ohne sensible Patientendaten. Die App verarbeitet dennoch personenbezogene Daten:

- Name
- E-Mail-Adresse
- Telefonnummer, optional
- Firmen-/Workspace-Daten
- Aufgaben
- Reflexionen
- hochgeladene Dateien, falls genutzt
- interne Coach-Notizen

Für die Testphase sollte daher gelten:

- Nur Testdaten oder normale Coaching-/Trainingsdaten verwenden.
- Keine Diagnosen, Befunde, Gesundheitsakten oder besonders schützenswerten Inhalte hochladen.
- Tester transparent informieren, dass es sich um einen MVP-Test handelt.
- Jeder Tester muss wissen, wer Zugriff auf seine Daten hat.

## Was bereits technisch umgesetzt ist

- Login über Supabase Auth
- Rollenlogik: Owner, Coach, Client
- Workspace-/Mandantentrennung
- Row Level Security in Supabase
- Clients sehen nur eigene Daten im jeweiligen Workspace
- Coaches sehen nur eigene Clients und eigene Workspaces
- Private Dateiablage über Supabase Storage mit signierten Download-Links
- Einladungslogik statt freier Selbstregistrierung
- Mehrere Workspaces pro E-Mail-Adresse möglich
- Coach-interne Notizen sind nicht für Clients sichtbar
- Client-Limit pro Coach für die Testphase

## Sofortmaßnahmen vor Testerstart

1. Kurze Tester-Info vorbereiten

   Inhalt:

   - Zweck: Validierung eines MVP für Aufgaben und Reflexionen zwischen Terminen.
   - Daten: Name, E-Mail, Aufgaben, Reflexionen und optional Dateien.
   - Zugriff: Der einladende Coach sieht die Daten seiner Clients.
   - Testphase: Feedback kann zur Produktverbesserung genutzt werden.
   - Löschung: Auf Wunsch werden Testdaten gelöscht.

2. Keine sensiblen Daten im Test verwenden

   Für morgen reicht eine mündliche oder schriftliche klare Vorgabe an Coaches: Bitte keine Diagnosen, Befunde, medizinischen Dokumente oder hochsensiblen personenbezogenen Daten in der Testphase verwenden.

3. Supabase absichern

   Prüfen:

   - Projektregion, idealerweise EU.
   - Auth-Einstellungen.
   - E-Mail-Templates.
   - RLS bleibt auf allen relevanten Tabellen aktiv.
   - Storage-Bucket für Anhänge bleibt privat.

4. Zugriff auf Supabase begrenzen

   Nur notwendige Personen erhalten Zugriff auf das Supabase-Projekt. Der Owner-Account sollte MFA verwenden.

5. Löschprozess festlegen

   Für Tester genügt vorerst ein einfacher Prozess:

   - Tester oder Coach bittet um Löschung.
   - Workspace, User-Profil, Aufgaben, Reflexionen und Dateien werden gelöscht oder anonymisiert.
   - Erledigung wird kurz bestätigt.

## Notwendig vor breiter Veröffentlichung

1. Datenschutzerklärung

   Eine öffentliche Datenschutzerklärung muss erklären:

   - Verantwortlicher
   - Zwecke der Verarbeitung
   - Kategorien personenbezogener Daten
   - Rechtsgrundlagen
   - Empfänger und Dienstleister
   - Speicherdauer
   - Rechte der Betroffenen
   - Kontakt für Datenschutzanfragen

2. Rollen sauber festlegen

   Wahrscheinliches Zielmodell:

   - Coach/Praxis/Trainer ist Verantwortlicher gegenüber eigenen Clients.
   - Moment:um ist Auftragsverarbeiter für die Coaches.
   - Supabase/GitHub sind Unterauftragsverarbeiter bzw. technische Dienstleister.

   Das muss rechtlich final geprüft werden.

3. Auftragsverarbeitungsvertrag

   Für B2B-Kunden braucht Moment:um später einen AVV mit Coaches. Zusätzlich muss geprüft werden, ob mit Supabase ein DPA/AVV abgeschlossen ist. Supabase stellt laut eigener DPA-Seite ein Data Processing Addendum bereit.

4. Technische und organisatorische Maßnahmen

   Dokumentieren:

   - Zugriffskontrolle
   - Rollen und Berechtigungen
   - Verschlüsselung bei Übertragung und Speicherung
   - Backups
   - Löschung
   - Incident-Prozess
   - Berechtigungskonzept
   - Monitoring und Protokollierung

5. Umgang mit Gesundheitsdaten

   Sobald Therapeuten, Physiotherapeuten oder andere Gesundheitsanbieter echte Patientendaten nutzen, kann Art. 9 DSGVO relevant werden. Dann braucht es eine klare Rechtsgrundlage, strengere TOMs, eventuell eine Datenschutz-Folgenabschätzung und sauberere vertragliche Grundlagen.

## Einschätzung für morgen

Für eine kleine MVP-Validierung mit eingeladenen Testern, ohne sensible Patientendaten und mit klarer Tester-Info ist das aktuelle Modell vertretbar vorbereitet. Für produktiven Betrieb mit echten Gesundheitsdaten ist es noch nicht ausreichend; dafür brauchen wir Datenschutzerklärung, AVV-Modell, DPA-Prüfung, Lösch-/Exportfunktionen und eine rechtliche Prüfung.

## Quellen

- DSGVO, Verordnung (EU) 2016/679, EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- DSGVO Art. 5: Grundsätze der Verarbeitung personenbezogener Daten.
- DSGVO Art. 9: besondere Kategorien personenbezogener Daten, darunter Gesundheitsdaten.
- DSGVO Art. 28: Auftragsverarbeiter.
- DSGVO Art. 32: Sicherheit der Verarbeitung.
- Supabase Security: https://supabase.com/security
- Supabase DPA: https://supabase.com/legal/dpa
- GitHub Privacy Policies: https://docs.github.com/en/site-policy/privacy-policies
