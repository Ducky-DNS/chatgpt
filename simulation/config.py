"""Configuration utilities for the SIR simulation CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import argparse


@dataclass(slots=True)
class SimulationConfig:
    """Configuration parameters for the SIR simulation."""

    population_size: int = 10_000
    initial_infected: int = 10
    initial_recovered: int = 0
    infection_rate: float = 0.08
    recovery_rate: float = 0.04
    contact_rate: int = 12
    steps: int = 180
    random_seed: Optional[int] = None
    export_path: Optional[Path] = None
    export_format: str = "csv"

    def validate(self) -> None:
        """Validate the configuration parameters and raise ValueError if invalid."""

        if self.population_size <= 0:
            raise ValueError("population_size must be positive")
        if not (0 <= self.initial_infected <= self.population_size):
            raise ValueError(
                "initial_infected must be between 0 and population_size inclusive"
            )
        if not (0 <= self.initial_recovered <= self.population_size):
            raise ValueError(
                "initial_recovered must be between 0 and population_size inclusive"
            )
        if self.initial_infected + self.initial_recovered > self.population_size:
            raise ValueError(
                "initial infected + recovered cannot exceed population size"
            )
        if not (0 <= self.infection_rate <= 1):
            raise ValueError("infection_rate must be between 0 and 1 inclusive")
        if not (0 <= self.recovery_rate <= 1):
            raise ValueError("recovery_rate must be between 0 and 1 inclusive")
        if self.contact_rate < 0:
            raise ValueError("contact_rate must be non-negative")
        if self.steps <= 0:
            raise ValueError("steps must be positive")
        if self.export_path is not None and self.export_path.is_dir():
            raise ValueError("export_path must be a file path, not a directory")
        if self.export_format.lower() not in {"csv", "json"}:
            raise ValueError("export_format must be either 'csv' or 'json'")


DEFAULT_CONFIG = SimulationConfig()


def parse_args(args: Optional[list[str]] = None) -> SimulationConfig:
    """Parse command line arguments and return a :class:`SimulationConfig`."""

    parser = argparse.ArgumentParser(
        description="Simulate the spread of an infectious disease using an SIR model.",
    )

    parser.add_argument(
        "--population",
        type=int,
        default=DEFAULT_CONFIG.population_size,
        help="Total number of individuals in the population (default: %(default)s)",
    )
    parser.add_argument(
        "--infected",
        type=int,
        default=DEFAULT_CONFIG.initial_infected,
        help="Initial number of infected individuals (default: %(default)s)",
    )
    parser.add_argument(
        "--recovered",
        type=int,
        default=DEFAULT_CONFIG.initial_recovered,
        help="Initial number of recovered individuals (default: %(default)s)",
    )
    parser.add_argument(
        "--infection-rate",
        type=float,
        default=DEFAULT_CONFIG.infection_rate,
        help=(
            "Probability that a single contact leads to infection. Value must be"
            " between 0 and 1 (default: %(default)s)"
        ),
    )
    parser.add_argument(
        "--recovery-rate",
        type=float,
        default=DEFAULT_CONFIG.recovery_rate,
        help=(
            "Probability that an infected individual recovers per step. Value must"
            " be between 0 and 1 (default: %(default)s)"
        ),
    )
    parser.add_argument(
        "--contacts",
        type=int,
        default=DEFAULT_CONFIG.contact_rate,
        help="Average number of close contacts per infected individual (default: %(default)s)",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=DEFAULT_CONFIG.steps,
        help="Number of steps to simulate (default: %(default)s)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_CONFIG.random_seed,
        help="Optional random seed for reproducible results.",
    )
    parser.add_argument(
        "--export",
        type=Path,
        help="Optional file path to export the simulation results (CSV or JSON).",
    )
    parser.add_argument(
        "--format",
        dest="export_format",
        default=DEFAULT_CONFIG.export_format,
        choices=["csv", "json"],
        help="Output format when exporting results (default: %(default)s)",
    )

    parsed = parser.parse_args(args=args)

    config = SimulationConfig(
        population_size=parsed.population,
        initial_infected=parsed.infected,
        initial_recovered=parsed.recovered,
        infection_rate=parsed.infection_rate,
        recovery_rate=parsed.recovery_rate,
        contact_rate=parsed.contacts,
        steps=parsed.steps,
        random_seed=parsed.seed,
        export_path=parsed.export,
        export_format=parsed.export_format,
    )
    config.validate()
    return config

