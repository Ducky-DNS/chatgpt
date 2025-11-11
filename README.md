# SIR Epidemic Simulation

Dieses Projekt enthält ein vollständiges Kommandozeilenprogramm zur Simulation einer Infektionskrankheit mit einem stochastischen SIR-Modell (Susceptible, Infected, Recovered).

## Installation

Das Programm benötigt lediglich eine Python-Standardinstallation (Python 3.10 oder neuer). Zusätzliche Abhängigkeiten sind nicht erforderlich.

## Nutzung

```bash
python main.py --help
```

Beispielausführung mit Export einer CSV-Datei:

```bash
python main.py --population 2000 --infected 5 --steps 120 --export ergebnis.csv
```

## Exportformate

* `csv`: Kommagetrennte Tabelle mit den Spalten `step`, `susceptible`, `infected`, `recovered`.
* `json`: Liste von Objekten mit denselben Feldern.

## Lizenz

Dieses Projekt wird ohne spezielle Lizenz bereitgestellt.

