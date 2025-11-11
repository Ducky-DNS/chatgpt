# Simulation der Ringproduktion als Webanwendung

Diese Version des Projekts besteht aus einer einzelnen HTML-Seite, die den
vollständigen manuellen Produktionsablauf zur Ringherstellung simuliert. Das
Tool ist für die Auswertung der Auslastung eines Mitarbeiters ausgelegt, der
mehrere Maschinen (Presse, Lösungseinheit, Raumaschinen) manuell bedient und
parallel Nachbearbeitungsschritte durchführt. Die Ergebnisse werden direkt im
Browser als Kennzahlen, Timeline-Tabellen und Gantt-Diagramm visualisiert.

## Funktionsumfang

* Interaktive Eingabe der Anzahl zu simulierender Zyklen sowie zentraler
  Prozessdauern (Presse, Lösung, optionale Rauvorgänge).
* Abbildung sämtlicher Handgriffe des Mitarbeiters inklusive Wartezeiten und
  Leerlauf.
* Automatische Maschinenabläufe für Vulkanisation, Lösung, Rau- und
  Zusatz-Rauvorgang mit Ressourcenblockierung.
* Kennzahlenkarten (Gesamtdauer, Auslastungen, Zyklusmittelwerte).
* Tabellenansicht der Mitarbeiter- und Maschinenereignisse.
* Farblich hervorgehobenes Gantt-Diagramm mit Legende und Zeitachse.

## Nutzung

1. Öffne `index.html` in einem aktuellen Browser (z. B. Chrome, Edge,
   Firefox). Eine Server-Installation ist nicht notwendig.
2. Wähle die gewünschte Anzahl an Zyklen (Standard: 3) und passe bei Bedarf die
   Prozessdauern an.
3. Starte die Simulation per Klick auf „Simulation starten“.
4. Die Ergebnisse erscheinen unmittelbar darunter; das Gantt-Diagramm skaliert
   automatisch auf die Gesamtdauer.

## Struktur

```
index.html        # Einstiegsseite mit Markup für Steuerung, Ergebnisse und Vorlagen
assets/style.css  # Gestaltung der Seite, Tabellen und Gantt-Balken
assets/app.js     # Simulationslogik, Rendering der Ausgaben
```

## Anpassungen

* Die Standarddauern lassen sich im Formular ändern (die Eingabe wird auf
  sinnvolle Grenzen geclamped).
* Zusätzliche Visualisierungen oder Exportfunktionen können direkt im Skript
  (`assets/app.js`) ergänzt werden.

## Lizenz

Dieses Projekt wird ohne spezielle Lizenz bereitgestellt.
