(function attachStimulusView(global) {
  const STIMULUS_CONFIG = {
    viewBoxSize: 120,
    squareSize: 72,
    squareStrokeWidth: 8,
    rotations: {
      normal: 0,
      rotated: 45
    },
    colors: {
      stroke: "#111111",
      filled: "#111111",
      unfilled: "#ffffff"
    },
    ariaLabel: "stimulus"
  };

  function renderSquareSvg(orientation, fill) {
    const size = STIMULUS_CONFIG.squareSize;
    const origin = (STIMULUS_CONFIG.viewBoxSize - size) / 2;
    const center = STIMULUS_CONFIG.viewBoxSize / 2;
    const rotation = STIMULUS_CONFIG.rotations[orientation] ?? 0;
    const fillColor = STIMULUS_CONFIG.colors[fill] ?? STIMULUS_CONFIG.colors.unfilled;

    return `
      <svg
        class="square-stimulus"
        viewBox="0 0 ${STIMULUS_CONFIG.viewBoxSize} ${STIMULUS_CONFIG.viewBoxSize}"
        aria-label="${STIMULUS_CONFIG.ariaLabel}"
        role="img"
      >
        <rect
          class="square-shape"
          x="${origin}"
          y="${origin}"
          width="${size}"
          height="${size}"
          fill="${fillColor}"
          stroke="${STIMULUS_CONFIG.colors.stroke}"
          stroke-width="${STIMULUS_CONFIG.squareStrokeWidth}"
          transform="rotate(${rotation} ${center} ${center})"
        ></rect>
      </svg>
    `;
  }

  function renderStimulus({
    orientation = "normal",
    fill = "unfilled",
    signal = "none",
    className = "instruction-stimulus",
    circleAttributes = ""
  } = {}) {
    const signalClass = signal && signal !== "none" ? ` signal-${signal}` : "";

    return `
      <div class="${className}">
        <div class="stop-circle${signalClass}" ${circleAttributes}>
          ${renderSquareSvg(orientation, fill)}
        </div>
      </div>
    `;
  }

  function renderAssignmentVisual(assignment) {
    if (!assignment) {
      return "";
    }

    if (assignment.kind === "orientation") {
      return renderKeycapSquare(assignment.orientation, "unfilled");
    }

    if (assignment.kind === "fill") {
      return renderKeycapSquare("normal", assignment.fill);
    }

    if (assignment.kind === "change") {
      return `<div class="keycap-signal keycap-signal-blue" aria-label="blue signal"></div>`;
    }

    return "";
  }

  function renderKeycapSquare(orientation, fill) {
    return `
      <div class="keycap-stimulus">
        ${renderSquareSvg(orientation, fill)}
      </div>
    `;
  }

  function renderResponseKey(slot, keyMapping = {}, assignment, options = {}) {
    const keyClass = slot.endsWith("_shift") ? "keycap-shift" : "keycap-inner";
    const compactClass = options.compact ? " keycap-compact" : "";
    const keyLabel = keyMapping[slot]?.label || slot;

    return `
      <div class="keycap ${keyClass}${compactClass}" aria-label="${keyLabel}">
        <div class="keycap-assignment">
          ${renderAssignmentVisual(assignment)}
          <div class="keycap-key-label">${keyLabel}</div>
        </div>
      </div>
    `;
  }

  function renderKeyboard({
    keyboardOrder,
    responseKeys,
    keyMapping = {},
    keyAssignments = {},
    className = "keyboard-row"
  }) {
    const activeKeys = new Set(responseKeys.map((key) => String(key)));
    const keys = [];

    keyboardOrder.forEach((key) => {
      const slot = String(key);

      if (slot === "right_inner") {
        keys.push(`<div class="key-slot key-slot-spacer"></div>`);
      }

      if (!activeKeys.has(slot)) {
        keys.push(`<div class="key-slot key-slot-${slot}"></div>`);
        return;
      }

      keys.push(`
        <div class="key-slot key-slot-${slot}">
          ${renderResponseKey(slot, keyMapping, keyAssignments[slot])}
        </div>
      `);
    });

    return `<div class="${className}">${keys.join("")}</div>`;
  }

  global.stopMissionStimulusView = {
    renderKeyboard,
    renderResponseKey,
    renderStimulus,
    renderSquareSvg
  };
})(window);
