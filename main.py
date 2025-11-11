"""Command line interface for the manual ring production workflow simulation."""

from __future__ import annotations

from typing import Iterable

from simulation import ProductionSimulation, SimulationResult, parse_args
from simulation.exporters import export_results
from simulation.reporting import (
    format_summary,
    render_gantt_chart,
    render_machine_overview,
    render_worker_timeline,
)


def main(argv: Iterable[str] | None = None) -> int:
    """Entry point for executing the production workflow simulation."""

    config = parse_args(list(argv) if argv is not None else None)
    simulation = ProductionSimulation(config)
    result: SimulationResult = simulation.run()

    print(format_summary(result.metrics))
    print()
    print(render_worker_timeline(result.timeline))
    print()
    print(render_machine_overview(result.machines))
    print()
    print(render_gantt_chart(result))

    if config.export_path:
        export_results(result, config.export_path, config.export_format)
        print()
        print(
            f"Simulation timeline exported to {config.export_path} "
            f"as {config.export_format.upper()}."
        )

    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    import sys

    raise SystemExit(main(sys.argv[1:]))
