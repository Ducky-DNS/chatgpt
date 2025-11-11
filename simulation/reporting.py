"""Utilities for presenting the results of the production workflow simulation."""

from __future__ import annotations

from typing import Mapping, Sequence

from .workflow import MachineEvent, SimulationMetrics, WorkerEvent


def format_summary(metrics: SimulationMetrics) -> str:
    """Return a human-readable summary of the simulation metrics."""

    lines = [
        "Simulationsübersicht",
        "====================",
        f"Gesamtdauer: {metrics.total_duration:.1f} s",
        f"Produktionszyklen: {metrics.cycles_completed}",
        f"Fertige Ringe: {metrics.packaged_rings}",
        "",
        "Arbeitszeit des Mitarbeiters",
        "----------------------------",
        f"Aktive Arbeitszeit: {metrics.worker_busy_time:.1f} s",
        f"Leerlaufzeit: {metrics.worker_idle_time:.1f} s",
        f"Auslastung: {metrics.worker_utilisation:.1%}",
        f"Durchschnittliche Zyklusdauer: {metrics.average_cycle_time:.1f} s",
        f"Durchschnittlicher Leerlauf pro Zyklus: {metrics.average_idle_per_cycle:.1f} s",
        "",
        "Maschinenauslastung",
        "--------------------",
        f"Presse: {metrics.press_utilisation:.1%}",
        f"Raumaschine: {metrics.roughening_utilisation:.1%}",
        f"Lösungseinheit: {metrics.solution_utilisation:.1%}",
    ]
    return "\n".join(lines)


def render_worker_timeline(timeline: Sequence[WorkerEvent]) -> str:
    """Render a tabular view of the worker timeline."""

    if not timeline:
        return "Keine Ereignisse erfasst."

    header = "Mitarbeitertimeline\n---------------------"
    rows = [header, f"{'Start':>8}  {'Ende':>8}  {'Dauer':>8}  Typ     Beschreibung"]
    for event in timeline:
        rows.append(
            f"{event.start:8.1f}  {event.end:8.1f}  {event.duration:8.1f}  "
            f"{event.kind:<6}  {event.description}" +
            (f" (Ring {event.ring_id})" if event.ring_id is not None else "")
        )
    return "\n".join(rows)


def render_machine_overview(machines: Mapping[str, Sequence[MachineEvent]]) -> str:
    """Render a table summarising machine utilisation events."""

    lines = ["Maschinenübersicht", "-------------------"]
    for name, events in machines.items():
        lines.append(f"{name}")
        if not events:
            lines.append("  (keine Vorgänge)")
            continue
        for event in events:
            lines.append(
                "  "
                + f"Ring {event.ring_id}: {event.start:.1f}s - {event.end:.1f}s "
                + f"({event.duration:.1f}s) – {event.description}"
            )
    return "\n".join(lines)
