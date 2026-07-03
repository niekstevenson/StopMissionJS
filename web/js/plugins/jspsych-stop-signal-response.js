(function attachStopSignalResponsePlugin(global) {
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
        stop_rule: {
          type: jsPsychModule.ParameterType.STRING,
          default: "none"
        },
        signal: {
          type: jsPsychModule.ParameterType.STRING,
          default: "none"
        },
        direction: {
          type: jsPsychModule.ParameterType.STRING,
          default: "left"
        },
        response_keys: {
          type: jsPsychModule.ParameterType.KEYS,
          default: ["z", "m"]
        },
        key_labels: {
          type: jsPsychModule.ParameterType.OBJECT,
          default: {}
        },
        keyboard_order: {
          type: jsPsychModule.ParameterType.OBJECT,
          default: ["z", "x", "c", "v", "b", "n", "m"]
        },
        go_key: {
          type: jsPsychModule.ParameterType.STRING,
          default: ""
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
      const validKeys = trial.response_keys.map((key) => key.toLowerCase());
      let startTime = null;
      let signalOnsetTime = null;
      let trialEndTime = null;
      let responseTimestamp = null;
      let responseEnabled = false;
      let signalPresented = false;
      let animationFrameId = null;
      let finished = false;

      displayElement.innerHTML = `
        <div class="stop-stage timing-hidden">
          <div class="stop-stimulus">
            <div class="stop-circle" data-stop-circle>
              ${this.renderArrow(trial.direction)}
            </div>
          </div>
          ${this.renderKeyboard(trial)}
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
          <p>The browser did not provide a usable keyboard event timestamp. This run was stopped instead of saving fallback reaction times.</p>
        `);
      };

      const isCorrect = (responseKey, responseTime) => {
        if (trial.intended_action === "withhold") {
          return responseKey === null;
        }

        if (responseKey !== String(trial.intended_key).toLowerCase()) {
          return false;
        }

        return !trial.requires_signal_for_success ||
          (signalOnsetTime !== null && responseTime !== null && responseTime >= signalOnsetTime);
      };

      const finish = (responseKey, rt, responseTime, finishTime) => {
        if (finished) {
          return;
        }

        const normalizedResponse = responseKey === null ? null : responseKey.toLowerCase();
        const correct = isCorrect(normalizedResponse, responseTime);
        responseTimestamp = responseTime;
        trialEndTime = finishTime;

        cleanup();
        this.jsPsych.finishTrial({
          record_type: trial.phase === "main" ? "response_trial" : "practice_trial",
          task: trial.task_name,
          phase: trial.phase,
          block: trial.block,
          trial: trial.trial_index,
          condition: trial.trial_type,
          stop_rule: trial.stop_rule,
          signal: trial.signal,
          direction: trial.direction,
          go_key: trial.go_key,
          intended_action: trial.intended_action,
          intended_key: trial.intended_key || null,
          requires_signal_for_success: trial.requires_signal_for_success,
          response_key: normalizedResponse,
          rt,
          correct,
          stop_success: trial.trial_type === "stop" ? correct : null,
          ssd: trial.trial_type === "stop" ? trial.ssd : null,
          actual_ssd: signalOnsetTime === null ? null : Math.round(signalOnsetTime - startTime),
          response_window: trial.response_window,
          stimulus_onset_time: Number(startTime.toFixed(3)),
          signal_onset_time: signalOnsetTime === null ? null : Number(signalOnsetTime.toFixed(3)),
          response_time: responseTimestamp === null ? null : Number(responseTimestamp.toFixed(3)),
          trial_end_time: Number(trialEndTime.toFixed(3)),
          trial_duration: Math.round(trialEndTime - startTime)
        });
      };

      const handleKeyDown = (event) => {
        if (!responseEnabled || event.repeat) {
          return;
        }

        const key = event.key.toLowerCase();

        if (!validKeys.includes(key)) {
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
          key,
          Math.round(keyTiming - startTime),
          keyTiming,
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

        const trialDuration = trial.trial_type === "stop"
          ? trial.ssd + trial.response_window
          : trial.response_window;

        if (timestamp >= startTime + trialDuration) {
          finish(null, null, null, timestamp);
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

    renderArrow(direction) {
      return `
        <svg
          class="simple-arrow arrow-${direction}"
          viewBox="0 0 90 64"
          aria-label="${direction} arrow"
          role="img"
        >
          <line class="arrow-line" x1="16" y1="32" x2="74" y2="32"></line>
          <line class="arrow-line" x1="74" y1="32" x2="50" y2="12"></line>
          <line class="arrow-line" x1="74" y1="32" x2="50" y2="52"></line>
        </svg>
      `;
    }

    renderKeyboard(trial) {
      const keyLabels = trial.key_labels || {};
      const activeKeys = new Set(trial.response_keys.map((key) => key.toLowerCase()));
      const keys = trial.keyboard_order.map((key) => {
        const lowerKey = key.toLowerCase();

        if (!activeKeys.has(lowerKey)) {
          return `<div class="key-slot"></div>`;
        }

        return `
          <div class="key-slot">
            <div class="keycap">
              <div class="keycap-key">${lowerKey.toUpperCase()}</div>
              <div class="keycap-label">${keyLabels[lowerKey] || ""}</div>
            </div>
          </div>
        `;
      });

      return `<div class="keyboard-row">${keys.join("")}</div>`;
    }
  }

  global.jsPsychStopSignalResponse = StopSignalResponsePlugin;
})(window);
