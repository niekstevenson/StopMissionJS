(function attachStopSignalResponsePlugin(global) {
  const stimulusView = global.stopMissionStimulusView;

  class StopSignalResponsePlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    static info = {
      name: "stop-signal-response",
      parameters: {
        task_name: {
          type: jsPsychModule.ParameterType.STRING,
          default: ""
        },
        phase: {
          type: jsPsychModule.ParameterType.STRING,
          default: "main"
        },
        block: {
          type: jsPsychModule.ParameterType.STRING,
          default: "main"
        },
        trial_index: {
          type: jsPsychModule.ParameterType.INT,
          default: 1
        },
        trial_type: {
          type: jsPsychModule.ParameterType.STRING,
          default: "go"
        },
        signal: {
          type: jsPsychModule.ParameterType.STRING,
          default: "none"
        },
        orientation: {
          type: jsPsychModule.ParameterType.STRING,
          default: "normal"
        },
        fill: {
          type: jsPsychModule.ParameterType.STRING,
          default: "unfilled"
        },
        response_keys: {
          type: jsPsychModule.ParameterType.KEYS,
          default: ["left_shift", "left_inner"]
        },
        key_map: {
          type: jsPsychModule.ParameterType.OBJECT,
          default: {}
        },
        key_assignments: {
          type: jsPsychModule.ParameterType.OBJECT,
          default: {}
        },
        keyboard_order: {
          type: jsPsychModule.ParameterType.OBJECT,
          default: ["left_shift", "left_inner", "right_inner", "right_shift"]
        },
        intended_action: {
          type: jsPsychModule.ParameterType.STRING,
          default: "respond"
        },
        intended_key: {
          type: jsPsychModule.ParameterType.STRING,
          default: ""
        },
        requires_signal_for_success: {
          type: jsPsychModule.ParameterType.BOOL,
          default: false
        },
        ssd: {
          type: jsPsychModule.ParameterType.INT,
          default: 200
        },
        response_window: {
          type: jsPsychModule.ParameterType.INT,
          default: 1500
        }
      }
    };

    trial(displayElement, trial) {
      const keyMap = trial.key_map || {};
      const responseSlots = trial.response_keys.map((key) => String(key));
      const responseCodes = new Map(
        responseSlots
          .map((slot) => [slot, keyMap[slot]?.code])
          .filter(([, code]) => code)
      );

      if (responseCodes.size !== responseSlots.length) {
        console.error("Missing response key mapping.", {
          response_keys: trial.response_keys,
          key_map: keyMap
        });
        this.jsPsych.abortExperiment("<p>Response key setup is incomplete. Reload the page and set the response keys again.</p>");
        return;
      }

      let startTime = null;
      let signalOnsetTime = null;
      let responseEnabled = false;
      let signalPresented = false;
      let animationFrameId = null;
      let finished = false;

      displayElement.innerHTML = `
        <div class="stop-stage timing-hidden">
          ${stimulusView.renderStimulus({
            orientation: trial.orientation,
            fill: trial.fill,
            className: "stop-stimulus",
            circleAttributes: "data-stop-circle"
          })}
          ${stimulusView.renderKeyboard({
            keyboardOrder: trial.keyboard_order,
            responseKeys: trial.response_keys,
            keyMapping: keyMap,
            keyAssignments: trial.key_assignments
          })}
        </div>
      `;

      const circle = displayElement.querySelector("[data-stop-circle]");

      const cleanup = () => {
        responseEnabled = false;
        finished = true;
        global.cancelAnimationFrame(animationFrameId);
        global.removeEventListener("keydown", handleKeyDown);
      };

      const abortForTimingError = (error) => {
        cleanup();
        console.error(error);
        this.jsPsych.abortExperiment(`
          <p>Timing error.</p>
          <p>The browser did not provide a usable keyboard event timestamp. This trial was not saved.</p>
        `);
      };

      const isCorrect = (responseKey, responseTime) => {
        if (trial.intended_action === "withhold") {
          return responseKey === null;
        }

        if (responseKey !== String(trial.intended_key)) {
          return false;
        }

        return !trial.requires_signal_for_success ||
          (signalOnsetTime !== null && responseTime !== null && responseTime >= signalOnsetTime);
      };

      const finish = (responseKey, rt, responseTime) => {
        if (finished) {
          return;
        }

        const correct = isCorrect(responseKey, responseTime);

        cleanup();
        this.jsPsych.finishTrial({
          task: trial.task_name,
          phase: trial.phase,
          block: trial.block,
          trial: trial.trial_index,
          task_trial_type: trial.trial_type,
          signal: trial.signal,
          orientation: trial.orientation,
          fill: trial.fill,
          response_key: responseKey,
          rt,
          correct,
          stop_success: trial.trial_type === "stop" ? correct : null,
          ssd: trial.trial_type === "stop" ? trial.ssd : null,
          actual_ssd: signalOnsetTime === null ? null : Math.round(signalOnsetTime - startTime)
        });
      };

      const handleKeyDown = (event) => {
        if (!responseEnabled || event.repeat) {
          return;
        }

        const responseSlot = responseSlots.find((slot) => responseCodes.get(slot) === event.code);

        if (!responseSlot) {
          return;
        }

        event.preventDefault();
        let keyTiming;

        try {
          keyTiming = this.getEventTimestamp(event);
        } catch (error) {
          abortForTimingError(error);
          return;
        }

        finish(
          responseSlot,
          Math.round(keyTiming - startTime),
          keyTiming
        );
      };

      const updateTiming = (timestamp) => {
        if (finished) {
          return;
        }

        if (trial.trial_type === "stop" && !signalPresented && timestamp >= startTime + trial.ssd) {
          signalPresented = true;
          signalOnsetTime = timestamp;
          circle.classList.add(`signal-${trial.signal}`);
        }

        if (timestamp >= startTime + trial.response_window) {
          finish(null, null, null);
          return;
        }

        animationFrameId = global.requestAnimationFrame(updateTiming);
      };

      global.requestAnimationFrame((timestamp) => {
        startTime = timestamp;
        responseEnabled = true;
        displayElement.querySelector(".stop-stage").classList.remove("timing-hidden");
        global.addEventListener("keydown", handleKeyDown);
        animationFrameId = global.requestAnimationFrame(updateTiming);
      });
    }

    getEventTimestamp(event) {
      const timestamp = Number(event.timeStamp);
      const now = performance.now();

      if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > now + 10000) {
        throw new Error(`Invalid keyboard event timestamp: ${event.timeStamp}`);
      }

      return timestamp;
    }

  }

  global.jsPsychStopSignalResponse = StopSignalResponsePlugin;
})(window);
