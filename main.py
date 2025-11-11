"""Command line interface for the SIR epidemic simulation program."""

from __future__ import annotations

from typing import Iterable

from simulation import SIRSimulation, calculate_metrics, parse_args
from simulation.exporters import export_history
from simulation.reporting import format_summary, render_population_chart


def main(argv: Iterable[str] | None = None) -> int:
    """Entry point for the CLI.

    Parameters
    ----------
    argv:
        Optional sequence of command line arguments. When omitted, :mod:`argparse`
        reads arguments from :data:`sys.argv`.
    """

    config = parse_args(list(argv) if argv is not None else None)
    simulation = SIRSimulation(config)
    history = simulation.run()
    metrics = calculate_metrics(history, config)

    print(format_summary(metrics, history))
    print(render_population_chart(history))

    if config.export_path:
        export_history(history, config.export_path, config.export_format)
        print()
        print(f"Results exported to {config.export_path} as {config.export_format.upper()}.")

    return 0


if __name__ == "__main__":  # pragma: no cover - entry point
    import sys

    raise SystemExit(main(sys.argv[1:]))

