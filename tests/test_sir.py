"""Tests for the stochastic SIR simulation implementation."""

from __future__ import annotations

import unittest

from simulation import SIRSimulation, SimulationConfig, calculate_metrics


class SIRSimulationTests(unittest.TestCase):
    """Basic behavioural checks for the SIR simulation."""

    def setUp(self) -> None:
        self.config = SimulationConfig(
            population_size=500,
            initial_infected=5,
            initial_recovered=0,
            infection_rate=0.2,
            recovery_rate=0.1,
            contact_rate=8,
            steps=120,
            random_seed=42,
        )

    def test_population_is_conserved(self) -> None:
        """Every recorded state should keep the total population constant."""

        simulation = SIRSimulation(self.config)
        history = simulation.run()

        for state in history:
            self.assertGreaterEqual(state.susceptible, 0)
            self.assertGreaterEqual(state.infected, 0)
            self.assertGreaterEqual(state.recovered, 0)
            self.assertEqual(state.total, self.config.population_size)

    def test_metrics_calculation_uses_history(self) -> None:
        """`calculate_metrics` should return values derived from the history."""

        simulation = SIRSimulation(self.config)
        history = simulation.run()

        metrics = calculate_metrics(history, self.config)

        self.assertGreaterEqual(metrics.peak_infected, 0)
        self.assertGreaterEqual(metrics.final_recovered, 0)
        self.assertGreaterEqual(metrics.basic_reproduction_number, 0)
        self.assertTrue(0 <= metrics.attack_rate <= 1)


if __name__ == "__main__":  # pragma: no cover - test module entry point
    unittest.main()

