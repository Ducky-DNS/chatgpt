"""Configuration utilities for the ring production workflow simulation."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import argparse


@dataclass(slots=True)
class TaskDurations:
    """Manual action durations in seconds for the worker."""

    form_ring: float = 30.0
    mount_adapter: float = 20.0
    transport_to_press: float = 30.0
    start_press: float = 10.0
    trim_ring: float = 45.0
    transfer_to_cooling: float = 20.0
    package_ring: float = 40.0
    transfer_to_solution: float = 25.0
    start_solution: float = 10.0
    transfer_to_roughening: float = 20.0
    start_primary_roughening: float = 5.0
    start_additional_roughening: float = 5.0
    unload_press: float = 30.0

    def validate(self) -> None:
        for field_name in self.__dataclass_fields__:
            value = getattr(self, field_name)
            if value < 0:
                raise ValueError(f"{field_name} must be non-negative")


@dataclass(slots=True)
class SimulationConfig:
    """Configuration parameters for the workflow simulation."""

    cycles: int = 3
    press_cycle_duration: float = 300.0
    cooling_duration: float = 180.0
    solution_duration: float = 180.0
    roughening_duration: float = 60.0
    additional_roughening_duration: float = 60.0
    include_optional_roughening: bool = True
    task_durations: TaskDurations = field(default_factory=TaskDurations)
    export_path: Optional[Path] = None
    export_format: str = "csv"

    def validate(self) -> None:
        if self.cycles <= 0:
            raise ValueError("cycles must be positive")
        if self.press_cycle_duration <= 0:
            raise ValueError("press_cycle_duration must be positive")
        if self.cooling_duration < 0:
            raise ValueError("cooling_duration must be non-negative")
        if self.solution_duration < 0:
            raise ValueError("solution_duration must be non-negative")
        if self.roughening_duration <= 0:
            raise ValueError("roughening_duration must be positive")
        if self.additional_roughening_duration < 0:
            raise ValueError("additional_roughening_duration must be non-negative")
        if self.export_path is not None and self.export_path.is_dir():
            raise ValueError("export_path must be a file path, not a directory")
        if self.export_format.lower() not in {"csv", "json"}:
            raise ValueError("export_format must be either 'csv' or 'json'")
        self.task_durations.validate()


DEFAULT_CONFIG = SimulationConfig()


def parse_args(args: Optional[list[str]] = None) -> SimulationConfig:
    """Parse command line arguments and return a :class:`SimulationConfig`."""

    parser = argparse.ArgumentParser(
        description=(
            "Simuliere den manuellen Produktionsablauf für die Ringherstellung "
            "inklusive Vulkanisation und Nachbearbeitung."
        )
    )

    parser.add_argument(
        "--cycles",
        type=int,
        default=DEFAULT_CONFIG.cycles,
        help="Anzahl der vollständigen Produktionszyklen (default: %(default)s)",
    )
    parser.add_argument(
        "--press-duration",
        type=float,
        default=DEFAULT_CONFIG.press_cycle_duration,
        help="Dauer des Vulkanisationspresszyklus in Sekunden (default: %(default)s)",
    )
    parser.add_argument(
        "--cooling-duration",
        type=float,
        default=DEFAULT_CONFIG.cooling_duration,
        help="Automatische Abkühlzeit nach der Kühlstation in Sekunden (default: %(default)s)",
    )
    parser.add_argument(
        "--solution-duration",
        type=float,
        default=DEFAULT_CONFIG.solution_duration,
        help="Dauer des Lösungsauftrags in Sekunden (default: %(default)s)",
    )
    parser.add_argument(
        "--roughening-duration",
        type=float,
        default=DEFAULT_CONFIG.roughening_duration,
        help="Maschinenzeit für den Rauvorgang in Sekunden (default: %(default)s)",
    )
    parser.add_argument(
        "--extra-roughening-duration",
        type=float,
        default=DEFAULT_CONFIG.additional_roughening_duration,
        help="Maschinenzeit für den optionalen zusätzlichen Rauvorgang (default: %(default)s)",
    )
    parser.add_argument(
        "--skip-optional-roughening",
        action="store_true",
        help="Zusätzlichen Rauvorgang deaktivieren.",
    )
    parser.add_argument(
        "--export",
        type=Path,
        help="Optionaler Dateipfad, um die Simulationsergebnisse zu exportieren.",
    )
    parser.add_argument(
        "--format",
        dest="export_format",
        default=DEFAULT_CONFIG.export_format,
        choices=["csv", "json"],
        help="Exportformat (default: %(default)s)",
    )

    parsed = parser.parse_args(args=args)

    config = SimulationConfig(
        cycles=parsed.cycles,
        press_cycle_duration=parsed.press_duration,
        cooling_duration=parsed.cooling_duration,
        solution_duration=parsed.solution_duration,
        roughening_duration=parsed.roughening_duration,
        additional_roughening_duration=parsed.extra_roughening_duration,
        include_optional_roughening=not parsed.skip_optional_roughening,
        export_path=parsed.export,
        export_format=parsed.export_format,
    )
    config.validate()
    return config
