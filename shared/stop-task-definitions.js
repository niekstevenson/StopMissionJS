(function attachStopTaskDefinitions(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.stopTaskDefinitions = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function buildDefinitions() {
  const TIMING = {
    initialSsd: 200,
    ssdStep: 50,
    minSsd: 50,
    fixationDuration: 500,
    responseWindow: 1500,
    iti: 500
  };

  const KEYBOARD_ORDER = ["z", "x", "c", "v", "b", "n", "m"];

  const TASKS = {
    stop_change_two: {
      id: "stop_change_two",
      title: "Stop change with two buttons",
      goKeys: { left: "z", right: "m" },
      responseKeys: ["z", "m"],
      keyLabels: { z: "Left", m: "Right" },
      stopRules: [
        {
          id: "opposite",
          signal: "blue",
          weight: 1,
          outcome: "opposite_go_key",
          requiresSignalForSuccess: true
        }
      ]
    },
    stop_change_three: {
      id: "stop_change_three",
      title: "Stop change with three buttons",
      goKeys: { left: "z", right: "c" },
      responseKeys: ["z", "c", "m"],
      keyLabels: { z: "Left", c: "Right", m: "Change" },
      stopRules: [
        {
          id: "change",
          signal: "blue",
          weight: 1,
          outcome: "fixed_key",
          key: "m",
          requiresSignalForSuccess: true
        }
      ]
    },
    stop_change_four: {
      id: "stop_change_four",
      title: "Stop change with four buttons",
      goKeys: { left: "z", right: "c" },
      responseKeys: ["z", "c", "b", "m"],
      keyLabels: { z: "Left", c: "Right", b: "Left change", m: "Right change" },
      stopRules: [
        {
          id: "direction_change",
          signal: "blue",
          weight: 1,
          outcome: "direction_change_key",
          changeKeys: { left: "b", right: "m" },
          requiresSignalForSuccess: true
        }
      ]
    },
    stimulus_selective: {
      id: "stimulus_selective",
      title: "Stimulus selective stop signal",
      goKeys: { left: "z", right: "m" },
      responseKeys: ["z", "m"],
      keyLabels: { z: "Left", m: "Right" },
      stopRules: [
        {
          id: "withhold",
          signal: "red",
          weight: 1,
          outcome: "withhold",
          requiresSignalForSuccess: false
        },
        {
          id: "ignore",
          signal: "blue",
          weight: 1,
          outcome: "go_key",
          requiresSignalForSuccess: false
        }
      ]
    }
  };

  const TASK_ORDER = [
    "stop_change_two",
    "stop_change_three",
    "stop_change_four",
    "stimulus_selective"
  ];

  function getTask(taskId) {
    const task = TASKS[taskId];

    if (!task) {
      throw new Error(`Unknown task "${taskId}".`);
    }

    return task;
  }

  function oppositeDirection(direction) {
    return direction === "left" ? "right" : "left";
  }

  function getStopRule(task, ruleId) {
    return task.stopRules.find((rule) => rule.id === ruleId);
  }

  function getIntendedResponse(task, trial) {
    const direction = trial.direction;

    if (trial.trial_type !== "stop") {
      return {
        intended_action: "respond",
        intended_key: task.goKeys[direction],
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

    if (rule.outcome === "opposite_go_key") {
      return {
        intended_action: "respond",
        intended_key: task.goKeys[oppositeDirection(direction)],
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

    if (rule.outcome === "direction_change_key") {
      return {
        intended_action: "respond",
        intended_key: rule.changeKeys[direction],
        requires_signal_for_success: rule.requiresSignalForSuccess
      };
    }

    return {
      intended_action: "respond",
      intended_key: task.goKeys[direction],
      requires_signal_for_success: rule.requiresSignalForSuccess
    };
  }

  return {
    KEYBOARD_ORDER,
    TASKS,
    TASK_ORDER,
    TIMING,
    getIntendedResponse,
    getTask,
    oppositeDirection
  };
});
