"""Export helpers for writing simulation results to disk."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable
import csv
import json

from .sir import SIRState


def export_history(states: Iterable[SIRState], path: Path, fmt: str = "csv") -> None:
    """Export the provided simulation history to *path* in the given format."""

    fmt = fmt.lower()
    if fmt == "csv":
        _export_csv(states, path)
    elif fmt == "json":
        _export_json(states, path)
    else:
        raise ValueError(f"Unsupported export format: {fmt}")


def _export_csv(states: Iterable[SIRState], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["step", "susceptible", "infected", "recovered"])
        writer.writeheader()
        for state in states:
            writer.writerow(state.to_dict())


def _export_json(states: Iterable[SIRState], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [state.to_dict() for state in states]
    with path.open("w", encoding="utf-8") as json_file:
        json.dump(data, json_file, indent=2)

