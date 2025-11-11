"""Top-level package for the SIR epidemic simulation program."""

from .config import SimulationConfig, parse_args
from .sir import SIRSimulation, SIRState, calculate_metrics

__all__ = [
    "SimulationConfig",
    "SIRSimulation",
    "SIRState",
    "calculate_metrics",
    "parse_args",
]
