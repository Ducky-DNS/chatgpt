"""Utilities for presenting the results of an SIR simulation."""

from __future__ import annotations

from typing import Iterable, Sequence

from .sir import SIRState, SimulationMetrics


def format_summary(metrics: SimulationMetrics, history: Sequence[SIRState]) -> str:
    """Return a human-readable summary for the simulation results."""

    final_state = history[-1]
    lines = [
        "Simulation Summary",
        "==================",
        f"Steps simulated: {history[-1].step}",
        f"Final susceptible: {final_state.susceptible}",
        f"Final infected: {final_state.infected}",
        f"Final recovered: {final_state.recovered}",
        "",
        "Key Metrics",
        "-----------",
        f"Peak infected individuals: {metrics.peak_infected} at step {metrics.peak_step}",
        f"Total recovered: {metrics.final_recovered}",
        f"Attack rate: {metrics.attack_rate:.2%}",
        f"Estimated basic reproduction number (R0): {metrics.basic_reproduction_number:.2f}",
    ]
    return "\n".join(lines)


def render_population_chart(history: Iterable[SIRState], width: int = 60) -> str:
    """Render a simple ASCII chart showing the population distribution."""

    history_list = list(history)
    if not history_list:
        return ""

    lines = ["", "Population distribution", "------------------------"]

    for state in history_list:
        bar = _build_population_bar(state, width)
        lines.append(f"{state.step:>4} | {bar}")

    lines.append("""
Legend:
    S - Susceptible
    I - Infected
    R - Recovered
""".strip("\n"))

    return "\n".join(lines)


def _build_population_bar(state: SIRState, width: int) -> str:
    total = state.total
    if total == 0:
        return "".ljust(width)

    susceptible_width = round(width * state.susceptible / total)
    infected_width = round(width * state.infected / total)
    recovered_width = width - susceptible_width - infected_width

    if recovered_width < 0:
        # Adjust rounding errors by trimming susceptible and infected widths.
        recovered_width = 0
        overflow = susceptible_width + infected_width - width
        if overflow > 0:
            if infected_width >= overflow:
                infected_width -= overflow
            else:
                susceptible_width = max(susceptible_width - (overflow - infected_width), 0)
                infected_width = 0

    return (
        "S" * susceptible_width
        + "I" * infected_width
        + "R" * recovered_width
    ).ljust(width)

