from __future__ import annotations

import unittest

from simulation import ProductionSimulation, SimulationConfig, TaskDurations
from simulation.reporting import render_gantt_chart


def build_config(**overrides):
    durations = TaskDurations(
        form_ring=5,
        mount_adapter=5,
        transport_to_press=5,
        start_press=1,
        trim_ring=4,
        transfer_to_cooling=3,
        package_ring=6,
        transfer_to_solution=3,
        start_solution=2,
        transfer_to_roughening=3,
        start_primary_roughening=2,
        start_additional_roughening=2,
        unload_press=4,
    )
    base = SimulationConfig(
        cycles=2,
        press_cycle_duration=20,
        cooling_duration=5,
        solution_duration=6,
        roughening_duration=4,
        additional_roughening_duration=4,
        include_optional_roughening=True,
        task_durations=durations,
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    base.validate()
    return base


class WorkflowSimulationTests(unittest.TestCase):
    def test_simulation_completes_all_rings(self) -> None:
        config = build_config()
        result = ProductionSimulation(config).run()

        self.assertEqual(result.metrics.cycles_completed, 2)
        self.assertEqual(result.metrics.packaged_rings, 2)
        self.assertGreater(result.metrics.total_duration, 0)
        self.assertIsNotNone(result.rings[-1].packaging_complete)

    def test_disabling_optional_roughening_skips_additional_jobs(self) -> None:
        config = build_config(include_optional_roughening=False)
        result = ProductionSimulation(config).run()

        roughening_events = [
            event
            for event in result.machines["Raumaschine"]
            if "Zusätzlicher" in event.description
        ]
        self.assertEqual(roughening_events, [])

    def test_worker_idle_time_recorded_when_no_ring_ready(self) -> None:
        config = build_config(cycles=1)
        result = ProductionSimulation(config).run()

        idle_segments = [event for event in result.timeline if event.kind == "idle"]
        self.assertTrue(idle_segments)
        total_idle = sum(segment.duration for segment in idle_segments)
        self.assertGreater(total_idle, 0)

    def test_gantt_chart_contains_expected_sections(self) -> None:
        config = build_config()
        result = ProductionSimulation(config).run()

        chart = render_gantt_chart(result, width=40)

        self.assertIn("Gantt-Diagramm", chart)
        self.assertIn("Mitarbeiter", chart)
        self.assertIn("Presse", chart)
        self.assertIn("Legende", chart)


if __name__ == "__main__":
    unittest.main()
