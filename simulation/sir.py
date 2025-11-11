"""Core simulation logic for the SIR epidemic model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List
import math
import random

from .config import SimulationConfig


@dataclass(slots=True)
class SIRState:
    """Represents the state of the population at a simulation step."""

    step: int
    susceptible: int
    infected: int
    recovered: int

    @property
    def total(self) -> int:
        """Return the total population represented by this state."""

        return self.susceptible + self.infected + self.recovered

    def to_dict(self) -> dict[str, int]:
        """Return the state as a dictionary suitable for serialization."""

        return {
            "step": self.step,
            "susceptible": self.susceptible,
            "infected": self.infected,
            "recovered": self.recovered,
        }


@dataclass(slots=True)
class SimulationMetrics:
    """Aggregate metrics derived from a completed simulation."""

    peak_infected: int
    peak_step: int
    final_recovered: int
    attack_rate: float
    basic_reproduction_number: float


class SIRSimulation:
    """Run a stochastic SIR simulation using configuration parameters."""

    def __init__(self, config: SimulationConfig):
        self.config = config
        self._rng = random.Random(config.random_seed)

    def run(self) -> List[SIRState]:
        """Execute the simulation and return the history of states."""

        susceptible = self.config.population_size - self.config.initial_infected
        susceptible -= self.config.initial_recovered
        infected = self.config.initial_infected
        recovered = self.config.initial_recovered

        history: List[SIRState] = [
            SIRState(
                step=0,
                susceptible=susceptible,
                infected=infected,
                recovered=recovered,
            )
        ]

        for step in range(1, self.config.steps + 1):
            previous = history[-1]
            new_infections = self._sample_new_infections(previous)
            new_recoveries = self._sample_new_recoveries(previous)

            susceptible = max(previous.susceptible - new_infections, 0)
            infected = max(previous.infected + new_infections - new_recoveries, 0)
            recovered = self.config.population_size - susceptible - infected

            if recovered < 0:
                # Guard against rounding artefacts that could push the total population
                # above the configured size by adjusting the susceptible pool.
                recovered = 0
                susceptible = self.config.population_size - infected

            history.append(
                SIRState(
                    step=step,
                    susceptible=susceptible,
                    infected=infected,
                    recovered=recovered,
                )
            )

            if infected == 0:
                break

        return history

    def _sample_new_infections(self, state: SIRState) -> int:
        """Estimate the number of new infections in the next step."""

        if state.susceptible == 0 or state.infected == 0:
            return 0

        exposure_opportunities = state.infected * self.config.contact_rate
        exposure_opportunities = min(exposure_opportunities, state.susceptible)

        return self._sample_binomial(exposure_opportunities, self.config.infection_rate)

    def _sample_new_recoveries(self, state: SIRState) -> int:
        """Estimate the number of recoveries in the next step."""

        if state.infected == 0:
            return 0
        return self._sample_binomial(state.infected, self.config.recovery_rate)

    def _sample_binomial(self, trials: int, probability: float) -> int:
        """Sample from a binomial distribution using a hybrid approach."""

        if trials <= 0 or probability <= 0:
            return 0
        if probability >= 1:
            return trials

        mean = trials * probability
        if trials < 50:
            successes = 0
            for _ in range(trials):
                if self._rng.random() < probability:
                    successes += 1
            return successes

        std_dev = math.sqrt(trials * probability * (1 - probability))
        sample = int(round(self._rng.gauss(mean, std_dev)))
        if sample < 0:
            return 0
        if sample > trials:
            return trials
        return sample


def calculate_metrics(history: Iterable[SIRState], config: SimulationConfig) -> SimulationMetrics:
    """Compute summary metrics for a completed simulation."""

    history_list = list(history)
    peak_state = max(history_list, key=lambda state: state.infected)
    final_state = history_list[-1]

    attack_rate = 0.0
    if config.population_size:
        attack_rate = (config.population_size - final_state.susceptible) / config.population_size

    basic_reproduction_number = 0.0
    if config.recovery_rate > 0:
        basic_reproduction_number = (
            config.infection_rate * config.contact_rate / config.recovery_rate
        )

    return SimulationMetrics(
        peak_infected=peak_state.infected,
        peak_step=peak_state.step,
        final_recovered=final_state.recovered,
        attack_rate=attack_rate,
        basic_reproduction_number=basic_reproduction_number,
    )

