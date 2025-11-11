"""Utilities for presenting the results of the production workflow simulation."""

from __future__ import annotations
from typing import Mapping, Sequence

from .workflow import (
    MachineEvent,
    SimulationMetrics,
    SimulationResult,
    WorkerEvent,
)


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


def render_gantt_chart(result: SimulationResult, width: int = 80) -> str:
    """Render a simple ASCII Gantt chart for the worker and machine timelines."""

    if width < 20:
        raise ValueError("width must be at least 20 characters")

    total_duration = max(
        result.metrics.total_duration,
        max((event.end for event in result.timeline), default=0.0),
    )
    if total_duration <= 0:
        return "Gantt-Diagramm nicht verfügbar (keine Ereignisse)."

    label_width = max(len("Mitarbeiter"), *(len(name) for name in result.machines)) + 2

    def build_lane(name: str, segments: Sequence[tuple[float, float, str]]) -> str:
        track = [" "] * width

        for start, end, symbol in segments:
            if end <= start:
                continue
            start_idx = min(width - 1, max(0, int((start / total_duration) * width)))
            end_idx = max(start_idx + 1, int((end / total_duration) * width))
            end_idx = min(width, end_idx)
            for idx in range(start_idx, end_idx):
                track[idx] = symbol
        return f"{name:<{label_width}}" + "".join(track)

    worker_segments = [
        (event.start, event.end, "#" if event.kind == "work" else ".")
        for event in result.timeline
    ]
    lane_strings: list[str] = [build_lane("Mitarbeiter", worker_segments)]

    machine_symbols: dict[str, str] = {}
    for machine_name, events in result.machines.items():
        symbol = machine_name[0].upper()
        machine_symbols[machine_name] = symbol
        segments = [
            (event.start, event.end, symbol)
            for event in events
        ]
        lane_strings.append(build_lane(machine_name, segments))

    chart_lines = ["Gantt-Diagramm", "---------------", f"Zeitraum: 0 s – {total_duration:.1f} s"]

    ticks = max(2, min(6, width // 10))
    tick_line = [" "] * width
    label_line = [" "] * width
    for i in range(ticks + 1):
        pos = min(width - 1, round(i * (width - 1) / ticks))
        tick_line[pos] = "|"
        value = i * total_duration / ticks
        label = f"{value:.0f}" + ("s" if i == ticks else "")
        label_start = max(0, min(width - len(label), pos - len(label) // 2))
        for offset, char in enumerate(label):
            idx = label_start + offset
            if idx < width:
                label_line[idx] = char

    chart_lines.append(" " * label_width + "".join(tick_line))
    chart_lines.append(" " * label_width + "".join(label_line))
    chart_lines.append("")

    chart_lines.extend(lane_strings)

    chart_lines.append("")
    legend_parts = ["# Arbeit", ". Leerlauf"]
    for machine_name, symbol in machine_symbols.items():
        legend_parts.append(f"{symbol} {machine_name}")
    chart_lines.append("Legende: " + ", ".join(legend_parts))

    return "\n".join(chart_lines)
