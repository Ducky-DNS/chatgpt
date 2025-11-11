"""Core simulation logic for the manual ring production workflow."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict, List, Mapping, MutableMapping, Optional, Sequence, Tuple
import heapq

from .config import SimulationConfig


@dataclass(slots=True)
class WorkerEvent:
    """Represents a contiguous block of time for the worker."""

    start: float
    end: float
    kind: str
    description: str
    ring_id: Optional[int] = None

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(slots=True)
class MachineEvent:
    """Represents an automated machine task triggered during the simulation."""

    machine: str
    ring_id: int
    start: float
    end: float
    description: str

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(slots=True)
class RingLifecycle:
    """Stores the timestamps for all stages a ring passes through."""

    ring_id: int
    form_complete: Optional[float] = None
    adapter_complete: Optional[float] = None
    press_load_complete: Optional[float] = None
    press_start: Optional[float] = None
    press_end: Optional[float] = None
    press_unload: Optional[float] = None
    trim_complete: Optional[float] = None
    cooling_transfer_complete: Optional[float] = None
    cooling_ready: Optional[float] = None
    roughening_transfer_complete: Optional[float] = None
    roughening_start: Optional[float] = None
    roughening_end: Optional[float] = None
    additional_roughening_end: Optional[float] = None
    solution_start: Optional[float] = None
    solution_end: Optional[float] = None
    packaging_complete: Optional[float] = None


@dataclass(slots=True)
class SimulationMetrics:
    """Aggregated metrics summarising a completed simulation."""

    total_duration: float
    worker_busy_time: float
    worker_idle_time: float
    worker_utilisation: float
    press_utilisation: float
    roughening_utilisation: float
    solution_utilisation: float
    cycles_completed: int
    packaged_rings: int
    average_cycle_time: float
    average_idle_per_cycle: float


@dataclass(slots=True)
class SimulationResult:
    """Full result set produced by the simulation."""

    timeline: Sequence[WorkerEvent]
    machines: Mapping[str, Sequence[MachineEvent]]
    rings: Sequence[RingLifecycle]
    metrics: SimulationMetrics


class ProductionSimulation:
    """Simulate the manual production workflow for ring manufacturing."""

    def __init__(self, config: SimulationConfig):
        self.config = config
        self._time: float = 0.0
        self._timeline: List[WorkerEvent] = []
        self._machine_events: Dict[str, List[MachineEvent]] = {
            "Presse": [],
            "Raumaschine": [],
            "Lösungseinheit": [],
        }
        self._rings: List[RingLifecycle] = []

        # Queues for intermediate stages (min-heaps by ready time)
        self._rings_ready_for_trimming: List[Tuple[float, RingLifecycle]] = []
        self._rings_ready_for_roughening: List[Tuple[float, RingLifecycle]] = []
        self._rings_ready_for_extra_roughening: List[Tuple[float, RingLifecycle]] = []
        self._rings_ready_for_solution: List[Tuple[float, RingLifecycle]] = []
        self._rings_ready_for_packaging: List[Tuple[float, RingLifecycle]] = []

        # Machine jobs currently running: (end_time, event, ring, stage)
        self._roughening_jobs: List[Tuple[float, MachineEvent, RingLifecycle, str]] = []
        self._solution_jobs: List[Tuple[float, MachineEvent, RingLifecycle]] = []

        # Rings staged for upcoming manual steps
        self._pending_solution_start: Deque[RingLifecycle] = deque()
        self._pending_roughening_start: Deque[RingLifecycle] = deque()

        # Machine availability times
        self._machine_available: MutableMapping[str, float] = {
            "Raumaschine": 0.0,
            "Lösungseinheit": 0.0,
        }

        self._current_press_end: Optional[float] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run(self) -> SimulationResult:
        """Execute the simulation and return the collected results."""

        for cycle in range(1, self.config.cycles + 1):
            ring = RingLifecycle(ring_id=cycle)
            self._rings.append(ring)
            self._process_cycle(ring)

        self._drain_pipeline()
        self._finalise_timeline()

        metrics = self._compute_metrics()
        return SimulationResult(
            timeline=tuple(self._timeline),
            machines={k: tuple(v) for k, v in self._machine_events.items()},
            rings=tuple(self._rings),
            metrics=metrics,
        )

    # ------------------------------------------------------------------
    # Core cycle logic
    # ------------------------------------------------------------------
    def _process_cycle(self, ring: RingLifecycle) -> None:
        durations = self.config.task_durations

        self._record_work(
            durations.form_ring,
            "Rohling vorbereiten und Ring formen",
            ring,
        )
        ring.form_complete = self._time

        self._record_work(
            durations.mount_adapter,
            "Ring auf Adapterkern montieren",
            ring,
        )
        ring.adapter_complete = self._time

        self._record_work(
            durations.transport_to_press,
            "Adapterkern zur Presse bringen",
            ring,
        )
        ring.press_load_complete = self._time

        self._record_work(
            durations.start_press,
            "Presszyklus starten",
            ring,
        )
        press_start = self._time
        press_end = press_start + self.config.press_cycle_duration
        ring.press_start = press_start
        ring.press_end = press_end
        self._current_press_end = press_end

        press_event = MachineEvent(
            machine="Presse",
            ring_id=ring.ring_id,
            start=press_start,
            end=press_end,
            description="Vulkanisationszyklus",
        )
        self._machine_events["Presse"].append(press_event)

        self._process_machine_completions()

        # During the press cycle the worker processes downstream tasks
        self._perform_trim_and_cooling()
        self._perform_packaging()
        self._perform_solution_transfer()
        self._start_solution_job()
        self._prepare_roughening()
        self._start_roughening_job()
        self._start_additional_roughening()

        # Remove the ring from the press after the cycle completes
        self._wait_until(press_end, "Auf Ende des Presszyklus warten")
        self._record_work(
            durations.unload_press,
            "Ring aus der Presse entnehmen",
            ring,
        )
        ring.press_unload = self._time
        heapq.heappush(self._rings_ready_for_trimming, (self._time, ring))
        self._process_machine_completions()
        self._current_press_end = None

    # ------------------------------------------------------------------
    # Stage helpers
    # ------------------------------------------------------------------
    def _perform_trim_and_cooling(self) -> bool:
        ring = self._acquire_ring(
            self._rings_ready_for_trimming,
            "einen vulkanisierten Ring zum Besäumen",
        )
        if ring is None:
            return False

        durations = self.config.task_durations
        self._record_work(
            durations.trim_ring,
            "Ring besäumen",
            ring,
        )
        ring.trim_complete = self._time

        self._record_work(
            durations.transfer_to_cooling,
            "Ring zur Kühlstation bringen",
            ring,
        )
        ring.cooling_transfer_complete = self._time
        cooling_ready = self._time + self.config.cooling_duration
        ring.cooling_ready = cooling_ready
        heapq.heappush(self._rings_ready_for_roughening, (cooling_ready, ring))
        self._process_machine_completions()
        return True

    def _perform_packaging(self) -> bool:
        ring = self._acquire_ring(
            self._rings_ready_for_packaging,
            "einen Ring für Lösung und Verpackung",
        )
        if ring is None:
            return False

        durations = self.config.task_durations
        self._record_work(
            durations.package_ring,
            "Ring mit Lösung behandeln und verpacken",
            ring,
        )
        ring.packaging_complete = self._time
        self._process_machine_completions()
        return True

    def _perform_solution_transfer(self) -> bool:
        ring = self._acquire_ring(
            self._rings_ready_for_solution,
            "einen geraute Ring zur Lösungseinheit bringen",
        )
        if ring is None:
            return False

        durations = self.config.task_durations
        self._record_work(
            durations.transfer_to_solution,
            "Geraute Ring zur Lösungseinheit bringen",
            ring,
        )
        self._pending_solution_start.append(ring)
        self._process_machine_completions()
        return True

    def _start_solution_job(self) -> bool:
        if not self._pending_solution_start:
            return False

        ring = self._pending_solution_start.popleft()
        self._ensure_machine_available(
            "Lösungseinheit",
            self._machine_available["Lösungseinheit"],
            "Lösungseinheit frei machen",
        )

        durations = self.config.task_durations
        self._record_work(
            durations.start_solution,
            "Lösungsauftrag starten",
            ring,
        )
        ring.solution_start = self._time
        event = MachineEvent(
            machine="Lösungseinheit",
            ring_id=ring.ring_id,
            start=self._time,
            end=self._time + self.config.solution_duration,
            description="Lösungsauftrag",
        )
        heapq.heappush(self._solution_jobs, (event.end, event, ring))
        self._machine_events["Lösungseinheit"].append(event)
        self._machine_available["Lösungseinheit"] = event.end
        self._process_machine_completions()
        return True

    def _prepare_roughening(self) -> bool:
        ring = self._acquire_ring(
            self._rings_ready_for_roughening,
            "einen abgekühlten Ring für den Rauvorgang",
        )
        if ring is None:
            return False

        durations = self.config.task_durations
        self._record_work(
            durations.transfer_to_roughening,
            "Ring zur Raumaschine bringen",
            ring,
        )
        ring.roughening_transfer_complete = self._time
        self._pending_roughening_start.append(ring)
        self._process_machine_completions()
        return True

    def _start_roughening_job(self) -> bool:
        if not self._pending_roughening_start:
            return False

        ring = self._pending_roughening_start.popleft()
        self._ensure_machine_available(
            "Raumaschine",
            self._machine_available["Raumaschine"],
            "Raumaschine frei machen",
        )

        durations = self.config.task_durations
        self._record_work(
            durations.start_primary_roughening,
            "Rauvorgang mit Folienauftrag starten",
            ring,
        )
        ring.roughening_start = self._time
        event = MachineEvent(
            machine="Raumaschine",
            ring_id=ring.ring_id,
            start=self._time,
            end=self._time + self.config.roughening_duration,
            description="Rauvorgang mit Folienauftrag",
        )
        heapq.heappush(self._roughening_jobs, (event.end, event, ring, "primary"))
        self._machine_events["Raumaschine"].append(event)
        self._machine_available["Raumaschine"] = event.end
        self._process_machine_completions()
        return True

    def _start_additional_roughening(self) -> bool:
        if not self.config.include_optional_roughening:
            return False

        ring = self._acquire_ring(
            self._rings_ready_for_extra_roughening,
            "einen Ring für den zusätzlichen Rauvorgang",
        )
        if ring is None:
            return False

        self._ensure_machine_available(
            "Raumaschine",
            self._machine_available["Raumaschine"],
            "Raumaschine frei machen",
        )

        durations = self.config.task_durations
        self._record_work(
            durations.start_additional_roughening,
            "Zusätzlichen Rauvorgang starten",
            ring,
        )
        event = MachineEvent(
            machine="Raumaschine",
            ring_id=ring.ring_id,
            start=self._time,
            end=self._time + self.config.additional_roughening_duration,
            description="Zusätzlicher Rauvorgang",
        )
        heapq.heappush(self._roughening_jobs, (event.end, event, ring, "additional"))
        self._machine_events["Raumaschine"].append(event)
        self._machine_available["Raumaschine"] = event.end
        self._process_machine_completions()
        return True

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------
    def _record_work(self, duration: float, description: str, ring: Optional[RingLifecycle]) -> None:
        start = self._time
        end = start + duration
        event = WorkerEvent(
            start=start,
            end=end,
            kind="work",
            description=description,
            ring_id=ring.ring_id if ring is not None else None,
        )
        self._timeline.append(event)
        self._time = end
        self._process_machine_completions()

    def _wait_until(self, moment: float, reason: str) -> None:
        if moment <= self._time:
            self._process_machine_completions()
            return
        event = WorkerEvent(
            start=self._time,
            end=moment,
            kind="idle",
            description=reason,
        )
        self._timeline.append(event)
        self._time = moment
        self._process_machine_completions()

    def _ensure_machine_available(self, machine: str, available_at: float, reason: str) -> None:
        if available_at > self._time:
            self._wait_until(available_at, reason)

    def _acquire_ring(
        self,
        queue: List[Tuple[float, RingLifecycle]],
        reason: str,
    ) -> Optional[RingLifecycle]:
        while True:
            self._process_machine_completions()
            if queue and queue[0][0] <= self._time:
                _, ring = heapq.heappop(queue)
                return ring
            if not queue:
                if not self._wait_for_next_event(reason):
                    return None
                continue
            next_ready = queue[0][0]
            if next_ready <= self._time:
                continue
            self._wait_until(next_ready, reason)

    def _wait_for_next_event(self, reason: str) -> bool:
        next_time = self._next_event_time()
        if next_time is None or next_time <= self._time:
            return False
        self._wait_until(next_time, reason)
        return True

    def _next_event_time(self) -> Optional[float]:
        times: List[float] = []
        for queue in (
            self._rings_ready_for_trimming,
            self._rings_ready_for_roughening,
            self._rings_ready_for_extra_roughening,
            self._rings_ready_for_solution,
            self._rings_ready_for_packaging,
        ):
            if queue:
                times.append(queue[0][0])
        if self._roughening_jobs:
            times.append(self._roughening_jobs[0][0])
        if self._solution_jobs:
            times.append(self._solution_jobs[0][0])
        if self._current_press_end is not None:
            times.append(self._current_press_end)
        future_times = [t for t in times if t > self._time]
        return min(future_times) if future_times else None

    def _process_machine_completions(self) -> None:
        progressed = True
        while progressed:
            progressed = False
            while self._roughening_jobs and self._roughening_jobs[0][0] <= self._time:
                _, event, ring, stage = heapq.heappop(self._roughening_jobs)
                if stage == "primary":
                    ring.roughening_end = event.end
                    if self.config.include_optional_roughening:
                        heapq.heappush(
                            self._rings_ready_for_extra_roughening,
                            (event.end, ring),
                        )
                    else:
                        heapq.heappush(self._rings_ready_for_solution, (event.end, ring))
                else:
                    ring.additional_roughening_end = event.end
                    heapq.heappush(self._rings_ready_for_solution, (event.end, ring))
                progressed = True

            while self._solution_jobs and self._solution_jobs[0][0] <= self._time:
                _, event, ring = heapq.heappop(self._solution_jobs)
                ring.solution_end = event.end
                heapq.heappush(self._rings_ready_for_packaging, (event.end, ring))
                progressed = True

    def _pipeline_has_work(self) -> bool:
        return any(
            (
                self._rings_ready_for_trimming,
                self._rings_ready_for_roughening,
                self._rings_ready_for_extra_roughening,
                self._rings_ready_for_solution,
                self._rings_ready_for_packaging,
                self._roughening_jobs,
                self._solution_jobs,
                self._pending_solution_start,
                self._pending_roughening_start,
            )
        )

    def _drain_pipeline(self) -> None:
        while self._pipeline_has_work():
            progress = False
            for action in (
                self._perform_trim_and_cooling,
                self._perform_packaging,
                self._perform_solution_transfer,
                self._start_solution_job,
                self._prepare_roughening,
                self._start_roughening_job,
                self._start_additional_roughening,
            ):
                if action():
                    progress = True
            if not progress:
                if not self._wait_for_next_event("Warten auf verfügbare Aufgaben"):
                    break

    def _finalise_timeline(self) -> None:
        latest_machine_end = max(
            (event.end for events in self._machine_events.values() for event in events),
            default=self._time,
        )
        if latest_machine_end > self._time:
            self._wait_until(latest_machine_end, "Automatische Prozesse abschließen")

    def _compute_metrics(self) -> SimulationMetrics:
        total_duration = self._timeline[-1].end if self._timeline else 0.0
        worker_busy_time = sum(
            event.duration for event in self._timeline if event.kind == "work"
        )
        worker_idle_time = total_duration - worker_busy_time
        worker_utilisation = (
            worker_busy_time / total_duration if total_duration else 0.0
        )

        def machine_busy(machine: str) -> float:
            return sum(event.duration for event in self._machine_events[machine])

        press_busy = machine_busy("Presse")
        roughening_busy = machine_busy("Raumaschine")
        solution_busy = machine_busy("Lösungseinheit")

        def utilisation(busy: float) -> float:
            return busy / total_duration if total_duration else 0.0

        packaged_rings = sum(1 for ring in self._rings if ring.packaging_complete is not None)
        average_cycle_time = (
            total_duration / self.config.cycles if self.config.cycles else 0.0
        )
        average_idle = worker_idle_time / self.config.cycles if self.config.cycles else 0.0

        return SimulationMetrics(
            total_duration=total_duration,
            worker_busy_time=worker_busy_time,
            worker_idle_time=worker_idle_time,
            worker_utilisation=worker_utilisation,
            press_utilisation=utilisation(press_busy),
            roughening_utilisation=utilisation(roughening_busy),
            solution_utilisation=utilisation(solution_busy),
            cycles_completed=self.config.cycles,
            packaged_rings=packaged_rings,
            average_cycle_time=average_cycle_time,
            average_idle_per_cycle=average_idle,
        )
