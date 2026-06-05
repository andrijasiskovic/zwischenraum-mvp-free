# Testphase, Limits und spätere Freischaltung

## Ziel

Für die Validierung soll jeder Coach zunächst bis zu 10 Clients selbstständig einladen können. Das Limit ist bewusst als Produkt-/Planlogik aufgebaut, damit es später nicht zurückgebaut werden muss.

## Aktueller Testplan

- Plan: `test`
- Client-Limit pro Workspace: 10
- Gezählt werden aktive Clients und offene Client-Einladungen.
- Coach- und Owner-Einladungen bleiben unabhängig vom Client-Limit möglich.
- Wenn das Limit erreicht ist, zeigt die App eine verständliche Meldung an und Supabase blockiert zusätzliche Client-Einladungen serverseitig.

## Spätere Freischaltung

Das Limit liegt pro Workspace in `organization_settings`:

- `plan_name`: aktueller Plan, z. B. `test`, `starter`, `pro`
- `client_limit`: erlaubte Anzahl Clients

Mögliche spätere Pakete:

- Testphase: 10 Clients kostenlos
- Starter: 25 Clients
- Pro: 75 Clients
- Praxis/Team: individuelles Limit

Eine Freischaltung erfolgt später ohne Code-Änderung durch Anpassung des Workspace-Datensatzes, z. B. `client_limit = 25`.

## Empfehlung für morgen

Für die ersten Tester reicht das 10er-Limit. Wenn ein Tester mehr braucht, ist das ein gutes Kaufsignal: "Für die Testphase sind 10 Clients inkludiert. Mehr Plätze können wir pro Workspace freischalten."
