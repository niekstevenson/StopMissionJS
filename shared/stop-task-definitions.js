(function attachStopTaskDefinitions(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.stopTaskDefinitions = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildDefinitions(root) {
  const TIMING = {
    initialSsd: 200,
    ssdStep: 50,
    minSsd: 50,
    fixationDuration: 500,
    responseWindow: 1500,
    iti: 500
  };

  const STIMULUS = {
    orientations: ["normal", "rotated"],
    fills: ["filled", "unfilled"]
  };

  const KEYBOARD_ORDER = ["left_shift", "left_inner", "right_inner", "right_shift"];

  const TASK_SPECS = loadTaskSpecs(root);
  const TASKS = Object.fromEntries(TASK_SPECS.map((task) => [task.id, task]));
  const TASK_ORDER = TASK_SPECS.map((task) => task.id);

  function loadTaskSpecs(root) {
    if (typeof module === "object" && module.exports) {
      return [
        require("./tasks/stop-change-two.js"),
        require("./tasks/stop-change-three.js"),
        require("./tasks/stop-change-four.js"),
        require("./tasks/stop-signal.js"),
        require("./tasks/stimulus-selective.js")
      ];
    }

    return root.stopTaskSpecs || [];
  }

  function getCounterbalanceIndex(subject, levels) {
    return (Number(subject) - 1) % levels;
  }

  function getOrientationMapping(keys, subject) {
    const flipped = getCounterbalanceIndex(subject, 2) === 1;

    return flipped
      ? { normal: keys[1], rotated: keys[0] }
      : { normal: keys[0], rotated: keys[1] };
  }

  function getFillMapping(keys, subject) {
    const flipped = Math.floor(getCounterbalanceIndex(subject, 4) / 2) === 1;

    return flipped
      ? { filled: keys[1], unfilled: keys[0] }
      : { filled: keys[0], unfilled: keys[1] };
  }

  function buildKeyAssignments(task, orientationKeys, fillKeys) {
    const assignments = {};

    STIMULUS.orientations.forEach((orientation) => {
      assignments[orientationKeys[orientation]] = {
        kind: "orientation",
        orientation
      };
    });

    if (task.changeKey) {
      assignments[task.changeKey] = {
        kind: "change",
        signal: "blue"
      };
    }

    if (fillKeys) {
      STIMULUS.fills.forEach((fill) => {
        assignments[fillKeys[fill]] = {
          kind: "fill",
          fill,
          signal: "blue"
        };
      });
    }

    return assignments;
  }

  function getTask(taskId, subject = 1) {
    const task = TASKS[taskId];

    if (!task) {
      throw new Error(`Unknown task "${taskId}".`);
    }

    const orientationKeys = getOrientationMapping(task.orientationResponseKeys, subject);
    const fillKeys = task.fillResponseKeys ? getFillMapping(task.fillResponseKeys, subject) : null;

    return {
      ...task,
      orientationKeys,
      fillKeys,
      keyAssignments: buildKeyAssignments(task, orientationKeys, fillKeys),
      counterbalance: getCounterbalanceIndex(subject, task.useFillDimension ? 4 : 2) + 1
    };
  }

  function oppositeOrientation(orientation) {
    return orientation === "normal" ? "rotated" : "normal";
  }

  function getStopRule(task, ruleId) {
    return task.stopRules.find((rule) => rule.id === ruleId);
  }

  function getIntendedResponse(task, trial) {
    const orientation = trial.orientation;
    const fill = trial.fill || "unfilled";

    if (trial.trial_type !== "stop") {
      return {
        intended_action: "respond",
        intended_key: task.orientationKeys[orientation],
        requires_signal_for_success: false
      };
    }

    const rule = getStopRule(task, trial.stop_rule);

    if (!rule) {
      throw new Error(`Unknown stop rule "${trial.stop_rule}" for ${task.id}.`);
    }

    if (rule.outcome === "withhold") {
      return {
        intended_action: "withhold",
        intended_key: "",
        requires_signal_for_success: false
      };
    }

    if (rule.outcome === "opposite_orientation_key") {
      return {
        intended_action: "respond",
        intended_key: task.orientationKeys[oppositeOrientation(orientation)],
        requires_signal_for_success: rule.requiresSignalForSuccess
      };
    }

    if (rule.outcome === "fixed_key") {
      return {
        intended_action: "respond",
        intended_key: rule.key,
        requires_signal_for_success: rule.requiresSignalForSuccess
      };
    }

    if (rule.outcome === "fill_key") {
      return {
        intended_action: "respond",
        intended_key: task.fillKeys[fill],
        requires_signal_for_success: rule.requiresSignalForSuccess
      };
    }

    return {
      intended_action: "respond",
      intended_key: task.orientationKeys[orientation],
      requires_signal_for_success: rule.requiresSignalForSuccess
    };
  }

  return {
    KEYBOARD_ORDER,
    STIMULUS,
    TASKS,
    TASK_ORDER,
    TIMING,
    getIntendedResponse,
    getTask,
    oppositeOrientation
  };
});
