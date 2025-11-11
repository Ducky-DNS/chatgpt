"""Export helpers for writing simulation results to disk."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
import csv
import json

from .workflow import SimulationResult


def export_results(result: SimulationResult, path: Path, fmt: str = "csv") -> None:
    """Export the simulation result to *path* in the provided format."""

    fmt = fmt.lower()
    if fmt == "csv":
        _export_csv(result, path)
    elif fmt == "json":
        _export_json(result, path)
    else:
        raise ValueError(f"Unsupported export format: {fmt}")


def _export_csv(result: SimulationResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        fieldnames = ["start", "end", "duration", "kind", "description", "ring_id"]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for event in result.timeline:
            writer.writerow(
                {
                    "start": f"{event.start:.2f}",
                    "end": f"{event.end:.2f}",
                    "duration": f"{event.duration:.2f}",
                    "kind": event.kind,
                    "description": event.description,
                    "ring_id": event.ring_id if event.ring_id is not None else "",
                }
            )
        writer.writerow({})
        writer.writerow({"kind": "metric", "description": "Metrics"})
        for key, value in asdict(result.metrics).items():
            writer.writerow(
                {
                    "kind": "metric",
                    "description": key,
                    "duration": f"{value:.2f}" if isinstance(value, float) else value,
                }
            )


def _export_json(result: SimulationResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "metrics": asdict(result.metrics),
        "timeline": [
            {
                "start": event.start,
                "end": event.end,
                "duration": event.duration,
                "kind": event.kind,
                "description": event.description,
                "ring_id": event.ring_id,
            }
            for event in result.timeline
        ],
        "machines": {
            name: [
                {
                    "ring_id": event.ring_id,
                    "start": event.start,
                    "end": event.end,
                    "duration": event.duration,
                    "description": event.description,
                }
                for event in events
            ]
            for name, events in result.machines.items()
        },
        "rings": [asdict(ring) for ring in result.rings],
    }
    with path.open("w", encoding="utf-8") as json_file:
        json.dump(data, json_file, indent=2)
