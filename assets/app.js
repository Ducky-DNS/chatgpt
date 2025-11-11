const controlsForm = document.getElementById("controls");
const resultsSection = document.getElementById("results");
const metricsContainer = document.getElementById("metrics");
const timelineContainer = document.getElementById("timeline");
const ganttContainer = document.getElementById("gantt");
const cycleInput = document.getElementById("cycle-count");
const presetSelect = document.getElementById("duration-preset");
const runButton = document.getElementById("run-simulation");
const durationInputs = {
  press: document.getElementById("press-duration"),
  solution: document.getElementById("solution-duration"),
  roughening: document.getElementById("roughening-duration"),
};
const exportButton = document.getElementById("export-csv");
const statusMessage = document.getElementById("controls-status");
exportButton.disabled = true;

const metricTemplate = document.getElementById("metric-template");
const timelineTemplate = document.getElementById("timeline-table-template");

const MIN_GANTT_WIDTH = 4000;
const GANTT_PX_PER_SECOND = 10;

const PRESETS = {
  standard: {
    press: 300,
    solution: 180,
    roughening: 120,
  },
  "lange-presse": {
    press: 360,
    solution: 200,
    roughening: 120,
  },
  maschinenfokus: {
    press: 300,
    solution: 240,
    roughening: 180,
  },
  schnell: {
    press: 240,
    solution: 150,
    roughening: 90,
  },
};

const RESOURCE_CLASS = {
  Mitarbeiter: "worker",
  Leerlauf: "idle",
  Presse: "Presse",
  "Lösungseinheit": "Loesungseinheit",
  Rauautomat: "Rauautomat",
};

let isApplyingPreset = false;
let lastSimulation = null;

function invalidateSimulation() {
  lastSimulation = null;
  exportButton.disabled = true;
  if (resultsSection.hidden || resultsSection.hasAttribute("hidden")) {
    setStatus("");
  } else {
    setStatus("Einstellungen geändert. Bitte Simulation erneut starten.");
  }
}

applyPreset(presetSelect.value);

presetSelect.addEventListener("change", () => {
  applyPreset(presetSelect.value);
  invalidateSimulation();
});

Object.values(durationInputs).forEach((input) => {
  input.addEventListener("input", () => {
    if (!isApplyingPreset) {
      presetSelect.value = "custom";
    }
    invalidateSimulation();
  });
});

cycleInput.addEventListener("input", () => {
  invalidateSimulation();
});

exportButton.addEventListener("click", () => {
  if (!lastSimulation) return;
  const csv = buildCsv(lastSimulation);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadCsv(csv, `ring-simulation_${timestamp}.csv`);
});

if (controlsForm) {
  controlsForm.addEventListener("submit", handleSimulationRun);
}

if (runButton) {
  runButton.addEventListener("click", handleSimulationRun);
}

function handleSimulationRun(event) {
  if (event) {
    event.preventDefault();
  }

  try {
    const config = readConfig();
    const simulation = runSimulation(config);
    renderGantt(simulation);
    renderMetrics(simulation);
    renderTimelines(simulation);
    lastSimulation = simulation;
    exportButton.disabled = false;
    resultsSection.hidden = false;
    resultsSection.removeAttribute("hidden");
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("Simulation erfolgreich aktualisiert.", "success");
  } catch (error) {
    console.error("Simulation failed", error);
    setStatus("Simulation konnte nicht gestartet werden. Siehe Konsole für Details.", "error");
  }
}

function setStatus(message, tone = "info") {
  if (!statusMessage) return;
  if (!message) {
    statusMessage.textContent = "";
    delete statusMessage.dataset.tone;
    return;
  }
  statusMessage.textContent = message;
  if (tone) {
    statusMessage.dataset.tone = tone;
  } else {
    delete statusMessage.dataset.tone;
  }
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset || name === "custom") return;
  isApplyingPreset = true;
  durationInputs.press.value = preset.press;
  durationInputs.solution.value = preset.solution;
  durationInputs.roughening.value = preset.roughening;
  isApplyingPreset = false;
}

function readConfig() {
  const cycles = clampNumber(parseInt(cycleInput.value, 10), 1, 15);
  const pressDuration = clampNumber(parseInt(durationInputs.press.value, 10), 60, 3600);
  const solutionDuration = clampNumber(parseInt(durationInputs.solution.value, 10), 10, 3600);
  const rougheningDuration = clampNumber(parseInt(durationInputs.roughening.value, 10), 30, 3600);

  return {
    cycles,
    durations: {
      press: pressDuration,
      solution: solutionDuration,
      roughening: rougheningDuration,
    },
  };
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function runSimulation(config) {
  const machineNames = ["Presse", "Lösungseinheit", "Rauautomat"];
  const machineEvents = Object.fromEntries(machineNames.map((name) => [name, []]));
  const machineAvailability = Object.fromEntries(machineNames.map((name) => [name, 0]));
  const machineBusy = Object.fromEntries(machineNames.map((name) => [name, 0]));

  const workerEvents = [];
  const allEvents = [];

  let workerTime = 0;
  let workerActiveStart = null;
  let totalManualTime = 0;
  let ringCounter = 0;

  const readyForBesaeumen = [];
  const readyForCooling = [];
  const readyForRoughTransport = [];
  const readyForRoughStart = [];
  const readyForSolutionTransport = [];
  const readyForPackaging = [];
  const ringsAwaitingUnload = [];

  const manual = (cycle, label, duration, description, options = {}) => {
    const start = Math.max(options.start ?? workerTime, workerTime);
    const end = start + duration;
    workerTime = end;
    const entry = {
      resource: "Mitarbeiter",
      label: `Zyklus ${cycle}: ${label}`,
      shortLabel: label,
      start,
      end,
      duration,
      type: "Manuell",
      description,
      cycle,
    };
    workerEvents.push(entry);
    allEvents.push(entry);
    totalManualTime += duration;
    if (workerActiveStart === null) {
      workerActiveStart = start;
    }
    return entry;
  };

  const machine = (cycle, resource, label, duration, description, requestedStart) => {
    const start = Math.max(requestedStart ?? workerTime, machineAvailability[resource]);
    const end = start + duration;
    const entry = {
      resource,
      label: `Zyklus ${cycle}: ${label}`,
      shortLabel: label,
      start,
      end,
      duration,
      type: "Automatisch",
      description,
      cycle,
      className: RESOURCE_CLASS[resource] ?? resource,
    };
    machineEvents[resource].push(entry);
    machineAvailability[resource] = end;
    machineBusy[resource] += duration;
    allEvents.push(entry);
    return entry;
  };

  const describeRing = (ring) => `Ring ${ring.id}`;

  const attemptTrim = (cycle) => {
    if (!readyForBesaeumen.length) return false;
    const entry = readyForBesaeumen.shift();
    const start = Math.max(workerTime, entry.availableTime);
    const event = manual(
      cycle,
      "Vulkanisierten Ring besäumen",
      45,
      `${describeRing(entry.ring)} am Säumgerät nachbearbeiten.`,
      { start }
    );
    readyForCooling.push({ ring: entry.ring, availableTime: event.end });
    return true;
  };

  const attemptCoolingTransport = (cycle) => {
    if (!readyForCooling.length) return false;
    const entry = readyForCooling.shift();
    const start = Math.max(workerTime, entry.availableTime);
    const event = manual(
      cycle,
      "Ring zur Kühlstation bringen",
      20,
      `${describeRing(entry.ring)} nach dem Besäumen zur Kühlung transportieren.`,
      { start }
    );
    readyForRoughTransport.push({ ring: entry.ring, availableTime: event.end });
    return true;
  };

  const attemptPackaging = (cycle) => {
    if (!readyForPackaging.length) return false;
    const entry = readyForPackaging.shift();
    const start = Math.max(workerTime, entry.availableTime);
    manual(
      cycle,
      "Ring aus Lösung entnehmen & verpacken",
      40,
      `${describeRing(entry.ring)} nach dem Lösungsvorgang kontrollieren und verpacken.`,
      { start }
    );
    return true;
  };

  const attemptSolution = (cycle) => {
    if (!readyForSolutionTransport.length) return false;
    const entry = readyForSolutionTransport.shift();
    const start = Math.max(workerTime, entry.availableTime);
    manual(
      cycle,
      "Gerauten Ring zum Lösungsauftrag bringen",
      25,
      `${describeRing(entry.ring)} von der Raumaschine abnehmen und zur Lösungseinheit tragen.`,
      { start }
    );
    manual(
      cycle,
      "Lösungsauftrag starten",
      10,
      `${describeRing(entry.ring)} im Lösungsvorgang starten und Parameter prüfen.`
    );
    const job = machine(
      cycle,
      "Lösungseinheit",
      "Lösungsprozess",
      config.durations.solution,
      `${describeRing(entry.ring)} chemisch behandeln und imprägnieren.`,
      workerTime
    );
    readyForPackaging.push({ ring: entry.ring, availableTime: job.end });
    return true;
  };

  const attemptRoughTransport = (cycle) => {
    if (!readyForRoughTransport.length) return false;
    const entry = readyForRoughTransport.shift();
    const start = Math.max(workerTime, entry.availableTime);
    const event = manual(
      cycle,
      "Abgekühlten Ring zur Raumaschine bringen",
      20,
      `${describeRing(entry.ring)} aus der Kühlung holen und an der Raumaschine einlegen.`,
      { start }
    );
    readyForRoughStart.push({ ring: entry.ring, availableTime: event.end });
    return true;
  };

  const attemptRoughStart = (cycle) => {
    if (!readyForRoughStart.length) return false;
    const entry = readyForRoughStart.shift();
    const start = Math.max(workerTime, entry.availableTime);
    manual(
      cycle,
      "Rauvorgang mit Folienauftrag starten",
      10,
      `${describeRing(entry.ring)} am Rauautomat inklusive Folienauftrag konfigurieren und starten.`,
      { start }
    );
    const job = machine(
      cycle,
      "Rauautomat",
      "Rauvorgang mit Folienauftrag",
      config.durations.roughening,
      `${describeRing(entry.ring)} automatisch anrauen und Folie aufbringen.`,
      workerTime
    );
    readyForSolutionTransport.push({ ring: entry.ring, availableTime: job.end });
    return true;
  };

  const processPipelineOnce = (cycle) => {
    let progressed = false;
    if (attemptTrim(cycle)) progressed = true;
    if (attemptCoolingTransport(cycle)) progressed = true;
    if (attemptPackaging(cycle)) progressed = true;
    if (attemptSolution(cycle)) progressed = true;
    if (attemptRoughTransport(cycle)) progressed = true;
    if (attemptRoughStart(cycle)) progressed = true;
    return progressed;
  };

  const processPipelineUntilIdle = (cycle) => {
    while (processPipelineOnce(cycle)) {
      /* iterate until keine weiteren Schritte möglich */
    }
  };

  const attemptUnload = (cycle) => {
    if (!ringsAwaitingUnload.length) return false;
    const next = ringsAwaitingUnload[0];
    const start = Math.max(workerTime, next.availableTime);
    manual(
      cycle,
      "Ring aus Presse entnehmen & zum Säumgerät bringen",
      30,
      `${describeRing(next.ring)} nach Zyklusende aus der Presse holen und dem Säumgerät zuführen.`,
      { start }
    );
    readyForBesaeumen.push({ ring: next.ring, availableTime: workerTime });
    ringsAwaitingUnload.shift();
    return true;
  };

  for (let cycle = 1; cycle <= config.cycles; cycle += 1) {
    ringCounter += 1;
    const ring = { id: ringCounter };

    manual(
      cycle,
      "Rohling holen & zum Ring verbinden",
      30,
      `${describeRing(ring)} vorbereiten und schließen.`
    );

    manual(
      cycle,
      "Ring auf Adapterkern aufbringen",
      20,
      `${describeRing(ring)} auf den Adapterkern setzen und sichern.`
    );

    manual(
      cycle,
      "Adapterkern zur Presse bringen & Ring übertragen",
      30,
      `${describeRing(ring)} zur Vulkanisationspresse transportieren und auf den Pressendorn legen.`
    );

    manual(
      cycle,
      "Presszyklus starten",
      10,
      `Pressprogramm für ${describeRing(ring)} starten.`
    );
    const pressJob = machine(
      cycle,
      "Presse",
      "Vulkanisationszyklus",
      config.durations.press,
      `${describeRing(ring)} unter Druck vulkanisieren.`,
      workerTime
    );
    ringsAwaitingUnload.push({ ring, availableTime: pressJob.end });

    processPipelineUntilIdle(cycle);
    attemptUnload(cycle);
  }

  const completionCycle = config.cycles + 1;
  let postProgress = false;
  do {
    postProgress = false;
    if (attemptUnload(completionCycle)) {
      postProgress = true;
    }
    if (processPipelineOnce(completionCycle)) {
      postProgress = true;
    }
  } while (postProgress);

  const totalDuration = Math.max(
    workerEvents.length ? workerEvents[workerEvents.length - 1].end : 0,
    ...machineNames.map((name) => machineAvailability[name])
  );

  const workerIdleSegments = computeWorkerIdleSegments(workerEvents, totalDuration);
  const workerIdleTime = workerIdleSegments.reduce((sum, segment) => sum + segment.duration, 0);
  const workerActiveEnd = workerEvents.length ? workerEvents[workerEvents.length - 1].end : 0;
  const workerActiveWindow = workerActiveStart !== null ? workerActiveEnd - workerActiveStart : 0;
  const workerUtilisation = workerActiveWindow > 0 ? (totalManualTime / workerActiveWindow) * 100 : 0;

  return {
    config,
    workerEvents,
    workerIdleSegments,
    machineEvents,
    totalManualTime,
    workerIdleTime,
    totalDuration,
    workerUtilisation,
    machineBusy,
    allEvents: allEvents.sort((a, b) => a.start - b.start || a.duration - b.duration),
  };
}

function computeWorkerIdleSegments(workerEvents, totalDuration) {
  if (!workerEvents.length) return [];
  const idle = [];
  const sorted = [...workerEvents].sort((a, b) => a.start - b.start);
  let cursor = sorted[0].start;

  for (const event of sorted) {
    if (event.start > cursor) {
      idle.push({
        resource: "Mitarbeiter",
        label: "Leerlauf",
        shortLabel: "Leerlauf",
        start: cursor,
        end: event.start,
        duration: event.start - cursor,
      });
    }
    cursor = Math.max(cursor, event.end);
  }

  if (cursor < totalDuration) {
    idle.push({
      resource: "Mitarbeiter",
      label: "Leerlauf",
      shortLabel: "Leerlauf",
      start: cursor,
      end: totalDuration,
      duration: totalDuration - cursor,
    });
  }

  return idle.filter((segment) => segment.duration > 0.01);
}

function renderMetrics(simulation) {
  metricsContainer.innerHTML = "";

  const throughputPerHour = simulation.totalDuration > 0 ? (simulation.config.cycles / simulation.totalDuration) * 3600 : 0;
  const idleShare = Math.max(0, 100 - simulation.workerUtilisation);

  const metrics = [
    {
      title: "Gesamtdauer",
      value: formatSeconds(simulation.totalDuration),
      hint: `Simulationslauf über ${simulation.config.cycles} Zyklus${simulation.config.cycles > 1 ? "se" : ""}.`,
    },
    {
      title: "Mitarbeiter-Auslastung",
      value: `${simulation.workerUtilisation.toFixed(1)} %`,
      hint: `${formatSeconds(simulation.totalManualTime)} produktive Zeit, ${formatSeconds(simulation.workerIdleTime)} Leerlauf.`,
    },
    {
      title: "Leerlaufanteil",
      value: `${idleShare.toFixed(1)} %`,
      hint: `Entspricht ${formatSeconds(simulation.workerIdleTime)} ohne zugewiesene Aufgaben.`,
    },
    {
      title: "Durchschnittliche Zyklusdauer",
      value: formatSeconds(simulation.totalDuration / simulation.config.cycles),
      hint: "Vom Start der Rohlingbearbeitung bis zur Pressen-Entnahme.",
    },
    {
      title: "Durchsatz pro Stunde",
      value: throughputPerHour > 0 ? `${throughputPerHour.toFixed(2)} Stück/h` : "–",
      hint: "Berechnet aus der Gesamtdauer aller simulierten Zyklen.",
    },
  ];

  const machineMetricConfig = [
    {
      key: "Presse",
      label: "Pressenauslastung",
      hint: (busy) => `${formatSeconds(busy)} Maschinenzeit inklusive passiver Kühlphase.`,
    },
    {
      key: "Lösungseinheit",
      label: "Lösungsauslastung",
      hint: (busy) => `${formatSeconds(busy)} aktiver Lauf für Lösung/Imprägnierung.`,
    },
    {
      key: "Rauautomat",
      label: "Rauautomat-Auslastung",
      hint: (busy) => `${formatSeconds(busy)} automatisierter Rauvorgang mit Folienauftrag.`,
    },
  ];

  machineMetricConfig.forEach(({ key, label, hint }) => {
    const busy = simulation.machineBusy[key] ?? 0;
    if (busy <= 0) return;
    metrics.push({
      title: label,
      value: utilisationText(busy, simulation.totalDuration),
      hint: hint(busy),
    });
  });

  for (const metric of metrics) {
    const node = metricTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = metric.title;
    node.querySelector(".metric__value").textContent = metric.value;
    node.querySelector(".metric__hint").textContent = metric.hint;
    metricsContainer.appendChild(node);
  }
}

function renderTimelines(simulation) {
  timelineContainer.innerHTML = "";

  const workerNode = timelineTemplate.content.firstElementChild.cloneNode(true);
  workerNode.querySelector("h3").textContent = "Mitarbeiter-Timeline";
  const workerBody = workerNode.querySelector("tbody");

  simulation.workerEvents.forEach((event) => {
    workerBody.appendChild(createTimelineRow(event));
  });

  timelineContainer.appendChild(workerNode);

  const machineNode = timelineTemplate.content.firstElementChild.cloneNode(true);
  machineNode.querySelector("h3").textContent = "Maschinenereignisse";
  const machineBody = machineNode.querySelector("tbody");

  const machineEvents = Object.values(simulation.machineEvents).flat();
  machineEvents
    .sort((a, b) => a.start - b.start)
    .forEach((event) => {
      machineBody.appendChild(createTimelineRow(event));
    });

  timelineContainer.appendChild(machineNode);
}

function createTimelineRow(event) {
  const row = document.createElement("tr");

  const stepCell = document.createElement("td");
  stepCell.textContent = event.label;
  row.appendChild(stepCell);

  const startCell = document.createElement("td");
  startCell.textContent = event.start.toFixed(0);
  row.appendChild(startCell);

  const endCell = document.createElement("td");
  endCell.textContent = event.end.toFixed(0);
  row.appendChild(endCell);

  const durationCell = document.createElement("td");
  durationCell.textContent = event.duration.toFixed(0);
  row.appendChild(durationCell);

  const typeCell = document.createElement("td");
  typeCell.textContent = event.type ?? "Manuell";
  row.appendChild(typeCell);

  const descCell = document.createElement("td");
  descCell.textContent = event.description ?? "";
  row.appendChild(descCell);

  return row;
}

function renderGantt(simulation) {
  ganttContainer.innerHTML = "";

  const content = document.createElement("div");
  content.className = "gantt__content";
  const ganttWidth = Math.max(
    MIN_GANTT_WIDTH,
    simulation.totalDuration * GANTT_PX_PER_SECOND
  );
  content.style.width = `${ganttWidth}px`;

  const header = document.createElement("div");
  header.className = "gantt__header";
  const title = document.createElement("h3");
  title.textContent = "Gantt-Diagramm";
  const subtitle = document.createElement("p");
  subtitle.textContent = `Zeitraum: ${formatSeconds(simulation.totalDuration)} (${simulation.totalDuration.toFixed(0)} s)`;
  header.append(title, subtitle);
  content.appendChild(header);

  const axis = document.createElement("div");
  axis.className = "gantt__axis";
  const axisScale = document.createElement("div");
  axisScale.className = "gantt__axis-scale";
  axis.appendChild(axisScale);
  const axisLabels = document.createElement("div");
  axisLabels.className = "gantt__axis-labels";
  const ticks = generateAxisTicks(simulation.totalDuration);
  const safeDuration = Math.max(simulation.totalDuration, 1);
  ticks.forEach((value) => {
    const position = (value / safeDuration) * 100;
    const tick = document.createElement("span");
    tick.className = "gantt__axis-tick";
    tick.style.left = `${position}%`;
    axisScale.appendChild(tick);

    const label = document.createElement("span");
    label.style.left = `${position}%`;
    label.textContent = formatAxisLabel(value);
    axisLabels.appendChild(label);
  });
  axis.appendChild(axisLabels);
  content.appendChild(axis);

  const rowsWrapper = document.createElement("div");
  rowsWrapper.className = "gantt__rows";

  const workerBars = mergeWorkerEvents(simulation.workerEvents, simulation.workerIdleSegments);
  rowsWrapper.appendChild(createGanttRow("Mitarbeiter", workerBars, simulation.totalDuration));

  const machines = [
    { name: "Presse", label: "Vulkanisationspresse" },
    { name: "Lösungseinheit", label: "Lösungseinheit" },
    { name: "Rauautomat", label: "Rauautomat" },
  ];

  machines.forEach((machine) => {
    const bars = simulation.machineEvents[machine.name] ?? [];
    if (bars.length === 0) return;
    rowsWrapper.appendChild(createGanttRow(machine.label, bars, simulation.totalDuration));
  });

  content.appendChild(rowsWrapper);

  content.appendChild(createLegend());

  ganttContainer.appendChild(content);
}

function mergeWorkerEvents(manualEvents, idleSegments) {
  const combined = [
    ...manualEvents.map((event) => ({ ...event, className: "worker" })),
    ...idleSegments.map((segment) => ({ ...segment, className: "idle" })),
  ];
  combined.sort((a, b) => a.start - b.start);
  return combined;
}

function createGanttRow(label, events, totalDuration) {
  const row = document.createElement("div");
  row.className = "gantt-row";

  const labelNode = document.createElement("div");
  labelNode.className = "gantt-row__label";
  labelNode.textContent = label;
  row.appendChild(labelNode);

  const timeline = document.createElement("div");
  timeline.className = "gantt-row__timeline";
  const safeDuration = Math.max(totalDuration, 1);

  events.forEach((event) => {
    const bar = document.createElement("div");
    const classSuffix = event.className ?? RESOURCE_CLASS[event.resource] ?? "worker";
    bar.className = `gantt-bar gantt-bar--${classSuffix}`;
    bar.style.left = `${(event.start / safeDuration) * 100}%`;
    bar.style.width = `${(event.duration / safeDuration) * 100}%`;
    bar.textContent = event.shortLabel ?? event.label;
    bar.title = `${event.label}\nStart: ${event.start.toFixed(0)} s\nEnde: ${event.end.toFixed(0)} s`;
    timeline.appendChild(bar);
  });

  row.appendChild(timeline);
  return row;
}

function createLegend() {
  const legend = document.createElement("div");
  legend.className = "gantt-legend";
  const items = [
    { className: "worker", label: "Manuelle Tätigkeit" },
    { className: "idle", label: "Mitarbeiter-Leerlauf" },
    { className: "Presse", label: "Vulkanisationspresse" },
    { className: "Loesungseinheit", label: "Lösungseinheit" },
    { className: "Rauautomat", label: "Rauautomat mit Folienauftrag" },
  ];

  items.forEach((item) => {
    const element = document.createElement("span");
    element.className = "gantt-legend__item";
    const swatch = document.createElement("span");
    swatch.className = `gantt-legend__swatch gantt-bar--${item.className}`;
    const text = document.createElement("span");
    text.textContent = item.label;
    element.append(swatch, text);
    legend.appendChild(element);
  });

  return legend;
}

function utilisationText(busy, total) {
  if (total === 0) return "0 %";
  return `${((busy / total) * 100).toFixed(1)} %`;
}

function formatSeconds(value) {
  const rounded = Math.max(0, value);
  const minutes = Math.floor(rounded / 60);
  const seconds = Math.round(rounded % 60);
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return `${minutes} min ${seconds.toString().padStart(2, "0")} s`;
}

function formatAxisLabel(value) {
  const rounded = Math.max(0, Math.round(value));
  if (rounded >= 600) {
    const minutes = Math.round(rounded / 60);
    return `${minutes} min`;
  }
  if (rounded >= 60) {
    const minutes = Math.floor(rounded / 60);
    const seconds = rounded % 60;
    if (seconds === 0) {
      return `${minutes} min`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")} min`;
  }
  return `${rounded} s`;
}

function generateAxisTicks(totalDuration) {
  const safeDuration = Math.max(totalDuration, 1);
  const spacing = chooseNiceSpacing(safeDuration / 8);
  const ticks = new Set([0, Number(totalDuration.toFixed(2))]);
  for (let value = spacing; value < safeDuration; value += spacing) {
    const clamped = Math.min(value, totalDuration);
    ticks.add(Number(clamped.toFixed(2)));
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

function chooseNiceSpacing(target) {
  const niceSteps = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200];
  for (const step of niceSteps) {
    if (target <= step) return step;
  }
  const largest = niceSteps[niceSteps.length - 1];
  return Math.ceil(target / largest) * largest;
}

function buildCsv(simulation) {
  const rows = [
    ["Ressource", "Zyklus", "Schritt", "Start_s", "Ende_s", "Dauer_s", "Typ", "Beschreibung"],
  ];

  const dataset = [
    ...simulation.workerEvents,
    ...simulation.workerIdleSegments.map((segment) => ({
      ...segment,
      type: "Leerlauf",
    })),
    ...Object.values(simulation.machineEvents).flat(),
  ].sort((a, b) => a.start - b.start || a.duration - b.duration);

  dataset.forEach((event) => {
    rows.push([
      event.resource ?? "",
      event.cycle ?? "",
      event.label ?? event.shortLabel ?? "",
      event.start !== undefined ? event.start.toFixed(0) : "",
      event.end !== undefined ? event.end.toFixed(0) : "",
      event.duration !== undefined ? event.duration.toFixed(0) : "",
      event.type ?? "Manuell",
      event.description ?? "",
    ]);
  });

  return rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
