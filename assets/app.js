const controlsForm = document.getElementById("controls");
const resultsSection = document.getElementById("results");
const metricsContainer = document.getElementById("metrics");
const timelineContainer = document.getElementById("timeline");
const ganttContainer = document.getElementById("gantt");
const cycleInput = document.getElementById("cycle-count");
const presetSelect = document.getElementById("duration-preset");
const includeOptionalCheckbox = document.getElementById("include-optional");
const runButton = document.getElementById("run-simulation");
const durationInputs = {
  press: document.getElementById("press-duration"),
  solution: document.getElementById("solution-duration"),
  roughening: document.getElementById("roughening-duration"),
  extraRoughening: document.getElementById("extra-roughening-duration"),
};
const exportButton = document.getElementById("export-csv");
const extraRougheningLabel = document.querySelector("label[for='extra-roughening-duration']");
const statusMessage = document.getElementById("controls-status");
exportButton.disabled = true;

const metricTemplate = document.getElementById("metric-template");
const timelineTemplate = document.getElementById("timeline-table-template");

const PRESETS = {
  standard: {
    press: 300,
    solution: 180,
    roughening: 120,
    extraRoughening: 120,
    includeOptional: true,
  },
  "lange-presse": {
    press: 360,
    solution: 200,
    roughening: 120,
    extraRoughening: 120,
    includeOptional: true,
  },
  maschinenfokus: {
    press: 300,
    solution: 240,
    roughening: 180,
    extraRoughening: 180,
    includeOptional: true,
  },
  schnell: {
    press: 240,
    solution: 150,
    roughening: 90,
    extraRoughening: 60,
    includeOptional: false,
  },
};

const RESOURCE_CLASS = {
  Mitarbeiter: "worker",
  Leerlauf: "idle",
  Presse: "Presse",
  "Lösungseinheit": "Loesungseinheit",
  Rauautomat: "Rauautomat",
  RauautomatPlus: "RauautomatPlus",
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

function updateOptionalState() {
  const disabled = !includeOptionalCheckbox.checked;
  durationInputs.extraRoughening.disabled = disabled;
  if (extraRougheningLabel) {
    extraRougheningLabel.classList.toggle("controls__label--disabled", disabled);
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

includeOptionalCheckbox.addEventListener("change", () => {
  if (!isApplyingPreset) {
    presetSelect.value = "custom";
  }
  invalidateSimulation();
  updateOptionalState();
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
    renderMetrics(simulation);
    renderTimelines(simulation);
    renderGantt(simulation);
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
  durationInputs.extraRoughening.value = preset.extraRoughening;
  if (typeof preset.includeOptional === "boolean") {
    includeOptionalCheckbox.checked = preset.includeOptional;
  }
  isApplyingPreset = false;
  updateOptionalState();
}

function readConfig() {
  const cycles = clampNumber(parseInt(cycleInput.value, 10), 1, 15);
  const includeOptional = includeOptionalCheckbox.checked;
  const pressDuration = clampNumber(parseInt(durationInputs.press.value, 10), 60, 3600);
  const solutionDuration = clampNumber(parseInt(durationInputs.solution.value, 10), 10, 3600);
  const rougheningDuration = clampNumber(parseInt(durationInputs.roughening.value, 10), 30, 3600);
  const extraRougheningDuration = clampNumber(parseInt(durationInputs.extraRoughening.value, 10), 30, 3600);

  return {
    cycles,
    includeOptional,
    durations: {
      press: pressDuration,
      solution: solutionDuration,
      roughening: rougheningDuration,
      extraRoughening: extraRougheningDuration,
    },
  };
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function runSimulation(config) {
  const machineNames = ["Presse", "Lösungseinheit", "Rauautomat", "RauautomatPlus"];
  const machineEvents = Object.fromEntries(machineNames.map((name) => [name, []]));
  const machineAvailability = Object.fromEntries(machineNames.map((name) => [name, 0]));
  const machineBusy = Object.fromEntries(machineNames.map((name) => [name, 0]));

  const workerEvents = [];
  const allEvents = [];

  let workerTime = 0;
  let workerActiveStart = null;
  let totalManualTime = 0;
  let previousPressComplete = 0;

  for (let cycle = 1; cycle <= config.cycles; cycle += 1) {
    const labelPrefix = `Zyklus ${cycle}`;

    const manual = (label, duration, description, options = {}) => {
      const start = Math.max(options.start ?? workerTime, workerTime);
      const end = start + duration;
      workerTime = end;
      const entry = {
        resource: "Mitarbeiter",
        label: `${labelPrefix}: ${label}`,
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

    const machine = (resource, label, duration, description, requestedStart) => {
      const start = Math.max(requestedStart ?? workerTime, machineAvailability[resource]);
      const end = start + duration;
      const entry = {
        resource,
        label: `${labelPrefix}: ${label}`,
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

    // 1. Rohling vorbereiten und Ring formen
    manual(
      "Rohling vorbereiten & formen",
      30,
      "Rohling aufnehmen, zuschneiden und zum Ring schließen."
    );

    // 2. Montage auf Adapterkern
    manual(
      "Ring auf Adapterkern montieren",
      20,
      "Ring aufsetzen, ausrichten und sichern."
    );

    // 3. Transport und Übergabe an die Presse
    manual(
      "Transport zur Presse & Auflegen",
      30,
      "Adapterkern zur Vulkanisationspresse bringen und Ring übergeben."
    );

    // 4. Start des Presszyklus (Bedienhandlung + Maschinenlauf)
    manual(
      "Presse bedienen & Zyklus starten",
      10,
      "Bedienelemente prüfen, Pressprogramm starten."
    );
    const pressJob = machine(
      "Presse",
      "Vulkanisationszyklus",
      config.durations.press,
      "Automatischer Vulkanisationslauf mit 300°C",
      workerTime
    );

    // 5. Besäumen des vorherigen Rings
    const startAfterPrevPress = Math.max(workerTime, previousPressComplete);
    manual(
      "Besäumen vorheriger Ring",
      45,
      "Grate entfernen und Kontur prüfen.",
      { start: startAfterPrevPress }
    );

    // 6. Abkühlung
    manual(
      "Ring zur Kühlstation bringen",
      20,
      "Besäumten Ring an die Kühlposition übergeben."
    );

    // 7. Lösung & Verpackung
    manual(
      "Lösung & Verpackung",
      40,
      "Abgekühlten Ring benetzen, prüfen und verpacken."
    );

    // 8. Übergabe an Lösungsauftrag
    const startSolutionHandOver = Math.max(workerTime, machineAvailability["Lösungseinheit"]);
    manual(
      "Ring von der Raumaschine entnehmen",
      25,
      "Geraute Ringe abnehmen und zur Lösungseinheit tragen.",
      { start: startSolutionHandOver }
    );

    // 9. Start des Lösungsauftrags (Bedienung + Maschinenlauf)
    manual(
      "Lösungsauftrag starten",
      10,
      "Programm starten, Parameter kontrollieren."
    );
    machine(
      "Lösungseinheit",
      "Lösungsprozess",
      config.durations.solution,
      "Chemischer Lösungslauf",
      workerTime
    );

    // 10. Vorbereitung nächster Rauvorgang
    const startRoughPrep = Math.max(workerTime, machineAvailability["Rauautomat"]);
    manual(
      "Ring zur Raumaschine bringen",
      20,
      "Vorbereiteter Ring für Rauvorgang positionieren.",
      { start: startRoughPrep }
    );

    // 11. Start Rauvorgang mit Folienauftrag (Maschinenlauf)
    machine(
      "Rauautomat",
      "Rauvorgang mit Folienauftrag",
      config.durations.roughening,
      "Automatischer Rauvorgang inkl. Folienauftrag",
      workerTime
    );

    // 12. Optionaler weiterer Rauvorgang
    if (config.includeOptional) {
      machine(
        "RauautomatPlus",
        "Zusätzlicher Rauvorgang",
        config.durations.extraRoughening,
        "Separater Rauvorgang ohne Folie",
        workerTime
      );
    }

    // 13. Entnahme aus der Presse (nach Ablauf des Zyklus)
    const unloadStart = Math.max(workerTime, pressJob.end);
    manual(
      "Ring aus Presse entnehmen",
      30,
      "Ring nach Zyklusende entnehmen und dem Säumgerät zuführen.",
      { start: unloadStart }
    );

    previousPressComplete = pressJob.end;
  }

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
    {
      key: "RauautomatPlus",
      label: "Zusatz-Rau-Auslastung",
      hint: (busy) => `${formatSeconds(busy)} zusätzlicher Rauvorgang ohne Folie.`,
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

  const header = document.createElement("div");
  header.className = "gantt__header";
  const title = document.createElement("h3");
  title.textContent = "Gantt-Diagramm";
  const subtitle = document.createElement("p");
  subtitle.textContent = `Zeitraum: ${formatSeconds(simulation.totalDuration)} (${simulation.totalDuration.toFixed(0)} s)`;
  header.append(title, subtitle);
  ganttContainer.appendChild(header);

  const axis = document.createElement("div");
  axis.className = "gantt__axis";
  const axisScale = document.createElement("div");
  axisScale.className = "gantt__axis-scale";
  axis.appendChild(axisScale);
  const axisLabels = document.createElement("div");
  axisLabels.className = "gantt__axis-labels";
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i += 1) {
    const fraction = i / tickCount;
    const label = document.createElement("span");
    label.style.left = `${fraction * 100}%`;
    label.textContent = `${Math.round(simulation.totalDuration * fraction)} s`;
    axisLabels.appendChild(label);
  }
  axis.appendChild(axisLabels);
  ganttContainer.appendChild(axis);

  const rowsWrapper = document.createElement("div");
  rowsWrapper.className = "gantt__rows";

  const workerBars = mergeWorkerEvents(simulation.workerEvents, simulation.workerIdleSegments);
  rowsWrapper.appendChild(createGanttRow("Mitarbeiter", workerBars, simulation.totalDuration));

  const machines = [
    { name: "Presse", label: "Vulkanisationspresse" },
    { name: "Lösungseinheit", label: "Lösungseinheit" },
    { name: "Rauautomat", label: "Rauautomat" },
    { name: "RauautomatPlus", label: "Rauautomat (optional)" },
  ];

  machines.forEach((machine) => {
    const bars = simulation.machineEvents[machine.name] ?? [];
    if (bars.length === 0) return;
    rowsWrapper.appendChild(createGanttRow(machine.label, bars, simulation.totalDuration));
  });

  ganttContainer.appendChild(rowsWrapper);

  ganttContainer.appendChild(createLegend());
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

  events.forEach((event) => {
    const bar = document.createElement("div");
    const classSuffix = event.className ?? RESOURCE_CLASS[event.resource] ?? "worker";
    bar.className = `gantt-bar gantt-bar--${classSuffix}`;
    bar.style.left = `${(event.start / totalDuration) * 100}%`;
    bar.style.width = `${(event.duration / totalDuration) * 100}%`;
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
    { className: "RauautomatPlus", label: "Zusätzlicher Rauvorgang" },
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
