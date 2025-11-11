# Simulation des manuellen Produktionsablaufs zur Ringherstellung

Dieses Projekt enthält ein Kommandozeilenprogramm, das den kompletten Arbeitszyklus
bei der manuellen Ringherstellung mit Vulkanisation, Rauvorgängen und Nachbearbeitung
simuliert. Eine einzelne Fachkraft bedient alle Stationen und Maschinen. Die Simulation
zeigt, wann welche Arbeitsschritte stattfinden, wie lange sie dauern und wie stark
Mitarbeiter und Maschinen ausgelastet sind.

## Funktionsumfang

* Abbildung aller Schritte vom Formen des Rohlings über den Presszyklus bis hin zur
  Verpackung eines fertigen Rings.
* Parallel laufende automatische Maschinenprozesse (Presse, Raumaschine,
  Lösungseinheit) inklusive Wartezeiten und Blockaden.
* Konfigurierbare Zyklus- und Prozessdauern, optionaler zusätzlicher Rauvorgang.
* Zusammenfassung mit Kennzahlen zu Auslastung, Leerlaufzeiten und Maschinenbelegung.
* Tabellarische Ausgabe der Mitarbeitertimeline sowie aller Maschinenereignisse.
* Export der Ergebnisse als CSV (Timeline + Kennzahlen) oder JSON (Timeline,
  Maschinen, Ring-Lebensläufe, Kennzahlen).

## Voraussetzungen

* Python 3.10 oder neuer.
* Es sind keine zusätzlichen Bibliotheken nötig.

## Nutzung

```bash
python main.py --help
```

Beispiel: drei Produktionszyklen mit deaktiviertem optionalen Rauvorgang und Export
als JSON-Datei.

```bash
python main.py --cycles 3 --skip-optional-roughening --export report.json --format json
```

Wichtige Optionen:

* `--cycles`: Anzahl der simulierten Produktionszyklen (Standard: 3).
* `--press-duration`: Laufzeit der Vulkanisationspresse in Sekunden (Standard: 300).
* `--cooling-duration`: Automatische Abkühlzeit nach der Kühlstation in Sekunden.
* `--solution-duration`: Dauer des Lösungsauftrags in Sekunden.
* `--roughening-duration`: Maschinenzeit für den Rauvorgang.
* `--extra-roughening-duration`: Dauer des optionalen Zusatz-Rauvorgangs.
* `--skip-optional-roughening`: Deaktiviert den zusätzlichen Rauvorgang.
* `--export / --format`: Exportpfad und -format (`csv` oder `json`).

## Exportformate

* **CSV**: Mitarbeitertimeline mit Start-, End- und Dauerwerten sowie Kennzahlen als
  zusätzlicher Abschnitt.
* **JSON**: Vollständiger Simulationslauf inklusive Kennzahlen, Mitarbeitertimeline,
  Maschinenbelegung und detaillierten Zeitstempeln je Ring.

## Tests

```bash
python -m unittest discover
```

## Lizenz

Dieses Projekt wird ohne spezielle Lizenz bereitgestellt.
