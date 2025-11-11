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
* Vordefinierte Zeitprofile (Standard, lange Presse, Maschinenfokus,
  beschleunigter Ablauf) zur schnellen Szenarioanalyse.
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
3. Optional: Wähle über „Zeitprofil“ eine Vorlage oder passe die
   Prozessdauern händisch an. Änderungen setzen die vorherigen Ergebnisse
   zurück.
4. Starte die Simulation per Klick auf „Simulation starten“.
5. Die Ergebnisse erscheinen unmittelbar darunter; das Gantt-Diagramm skaliert
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

## Datenexport

* Über den Button „CSV exportieren“ lassen sich sämtliche Ereignisse (inkl.
  Leerlaufabschnitte und Maschinenjobs) herunterladen. Die Datei nutzt
  Semikolons als Trenner und kann in Excel, Power BI oder BI-Tools importiert
  werden.

## Lizenz

Dieses Projekt wird ohne spezielle Lizenz bereitgestellt.
