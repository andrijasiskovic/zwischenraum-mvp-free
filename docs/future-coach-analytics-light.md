# Future Goal: Coach Analytics Light

Dieses Modul wird noch nicht eingebaut. Es ist als eines der naechsten Produktziele gespeichert.

## Produktthese

Moment:um soll Coaches, Therapeut:innen, Trainer:innen und Berater:innen nicht nur beim Verteilen von Aufgaben helfen, sondern sichtbar machen, ob die Begleitung zwischen Terminen wirkt.

Starke Verkaufsthese:

> Wenn Moment:um hilft, die Umsetzungsquote von Aufgaben deutlich zu steigern, entsteht ein sehr klarer Zahlungsgrund fuer Anbieter.

Beispiel im Verkaufsgespraech:

> Wenn du mir hilfst, die Umsetzungsquote der Aufgaben von 40% auf 80% zu erhoehen, zahle ich sofort.

## Zielnutzen

Der Coach soll kompakt erkennen:

- Wer bleibt aktiv?
- Wer laesst nach?
- Wer braucht ein Nachfassen?
- Welche Aufgaben werden umgesetzt?
- Wie entwickelt sich ein Client ueber mehrere Wochen?
- Welche Reflexionen zeigen Fortschritt, Unsicherheit oder Widerstand?

Kernversprechen:

> Ich sehe frueh, wer dranbleibt, wer abrutscht und wo ich gezielt nachfassen muss.

## Geplante Funktionen

### Client-Fortschrittskarte

Pro Client eine kompakte Karte mit:

- Umsetzungsquote
- offene Aufgaben
- ueberfaellige Aufgaben
- erledigte Aufgaben
- letzte Aktivitaet
- Reflexionsanzahl
- Nachfassbedarf als Ampel

### Aktivitaets-Score

Regelbasiert, ohne AI im ersten Schritt.

Moegliche Faktoren:

- letzte Aktivitaet
- erledigte Aufgaben
- abgegebene Reflexionen
- offene Aufgaben
- ueberfaellige Aufgaben
- Regelmaessigkeit der Umsetzung

### Nachfassbedarf / Risiko-Signal

Nicht als klinische "Abbruchwahrscheinlichkeit" formulieren, sondern vorsichtiger:

- Nachfassbedarf
- Aufmerksamkeitsbedarf
- Engagement-Risiko
- Betreuungsrisiko

Ampellogik:

- Gruen: stabil aktiv
- Gelb: Aktivitaet sinkt
- Rot: deutliches Nachfasssignal

### Therapieverlauf / Betreuungsverlauf

Im Client-Profil kompakt anzeigen:

- Verlauf der letzten Wochen
- erledigte vs. zugewiesene Aufgaben pro Woche
- Entwicklung der ueberfaelligen Aufgaben
- Entwicklung der Reflexionen
- kurze Trendanzeige

### Reflexionshistorie

Kompakter Feed im Client-Profil:

- Aufgabe
- Datum
- Stimmung / Status
- Reflexionstext
- optional Coach-Notiz daneben

### Dashboard-Kennzahlen

Fuer den Coach:

- durchschnittliche Umsetzungsquote
- Clients mit hohem Nachfassbedarf
- offene Aufgaben gesamt
- ueberfaellige Aufgaben gesamt
- Reflexionen seit letztem Login / seit letzter Woche

## Erste regelbasierte Score-Idee

Aktivitaets-Score 0 bis 100:

- +20 letzte Aktivitaet innerhalb von 3 Tagen
- +20 mindestens eine Aufgabe kuerzlich erledigt
- +20 Reflexion abgegeben
- +20 keine ueberfaelligen Aufgaben
- +20 Umsetzungsquote ueber 70%

Nachfassbedarf 0 bis 100:

- +25 letzte Aktivitaet aelter als 7 Tage
- +25 mehr als 2 ueberfaellige Aufgaben
- +20 Umsetzungsquote unter 40%
- +15 Reflexionen bleiben aus
- +15 Trend verschlechtert sich

Schwellen:

- 0-30 niedrig
- 31-60 mittel
- 61-100 hoch

## UX-Prinzip

Alles muss extrem kompakt bleiben.

Keine grossen Statistikseiten als erstes. Stattdessen:

- kleine Score-Chips
- Ampel
- Mini-Trend
- kompakte Client-Karten
- Verlauf nur im Client-Profil detaillierter

Der Coach soll innerhalb weniger Sekunden sehen, wo Aufmerksamkeit notwendig ist.

## Spaetere AI-Erweiterung

Erst nach sauberer Validierung und Datenschutzklaerung:

- Reflexionen zusammenfassen
- Muster erkennen
- Nachfasshinweise formulieren
- Vorbereitung fuer naechste Session erstellen
- Aufgaben-Vorschlaege ableiten

AI darf nicht vorschnell diagnostisch wirken. Besonders fuer Therapie-Kontexte muss Sprache behutsam und nicht-klinisch formuliert sein.
