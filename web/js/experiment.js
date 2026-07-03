(function runExperiment(global) {
  const definitions = global.stopTaskDefinitions;
  const persistence = global.stopMissionPersistence;
  const timing = definitions.TIMING;
  let sessionWasAborted = false;
  let activeJsPsych = null;
  let activeDebugKeyHandler = null;

  function getQueryConfig() {
    const params = new URLSearchParams(global.location.search);
    return {
      task: params.get("task") || definitions.TASK_ORDER[0],
      subject: Number(params.get("subject") || 1)
    };
  }

  function renderMessage(message) {
    const target = document.getElementById("jspsych-target");
    target.innerHTML = `<div class="stop-message">${message}</div>`;
  }

  function normalizeDesign(rawRows, task) {
    return rawRows.map((row) => {
      const base = {
        subject: row.subject,
        task: row.task,
        trial: row.trial,
        block: row.block,
        trial_type: row.trial_type,
        stop_rule: row.stop_rule,
        signal: row.signal,
        direction: row.direction,
        go_key: row.go_key,
        fixation_duration: row.fixation_duration,
        response_window: row.response_window,
        iti: row.iti
      };
      const intended = definitions.getIntendedResponse(task, base);

      return {
        ...base,
        intended_action: intended.intended_action,
        intended_key: intended.intended_key,
        requires_signal_for_success: intended.requires_signal_for_success
      };
    });
  }

  function stripLocalFields(record) {
    const { server_saved, ...serverRecord } = record;
    return serverRecord;
  }

  function sanitizeTrialRecord(data, sessionId) {
    const stimulusType = data.condition === "stop" ? `stop_${data.signal}` : "go";

    return {
      record_type: data.record_type,
      task: data.task,
      subject: data.subject,
      session_id: sessionId,
      phase: data.phase,
      block: data.block,
      trial: data.trial,
      stimulus_type: stimulusType,
      stimulus_direction: data.direction,
      ssd_ms: data.ssd ?? "NA",
      ssd_actual_ms: data.actual_ssd ?? "NA",
      rt_ms: data.rt ?? "NA",
      response: data.response_key ?? "NA",
      condition: data.condition,
      stop_rule: data.stop_rule,
      stop_signal: data.signal,
      arrow_direction: data.direction,
      go_key: data.go_key,
      intended_action: data.intended_action,
      intended_key: data.intended_key,
      requires_signal_for_success: data.requires_signal_for_success,
      response_key: data.response_key,
      correct: data.correct,
      stop_success: data.stop_success,
      ssd_after_ms: data.ssd_after,
      response_window_ms: data.response_window,
      stimulus_onset_ms: data.stimulus_onset_time,
      stop_signal_onset_ms: data.signal_onset_time,
      response_timestamp_ms: data.response_time,
      trial_end_ms: data.trial_end_time,
      trial_duration_actual_ms: data.trial_duration
    };
  }

  async function syncBufferedTrials(sessionKey) {
    const session = await persistence.getSession(sessionKey);

    if (!session) {
      return;
    }

    const bufferedTrials = session.trials.filter(
      (trial) => trial.record_type === "response_trial" && !trial.server_saved
    );

    for (const bufferedTrial of bufferedTrials) {
      try {
        await persistence.postRecord(stripLocalFields(bufferedTrial));
        await persistence.markTrialServerSaved(sessionKey, bufferedTrial.trial);
      } catch (error) {
        console.error(error);
        break;
      }
    }
  }

  async function persistResponseTrial(sessionKey, trialRecord) {
    let localSaved = false;

    try {
      await persistence.saveTrial(sessionKey, trialRecord);
      localSaved = true;
    } catch (error) {
      console.error(error);
    }

    try {
      await persistence.postRecord(stripLocalFields(trialRecord));

      if (localSaved) {
        await persistence.markTrialServerSaved(sessionKey, trialRecord.trial);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function prepareSession(sessionKey, task, subject, totalTrials) {
    let session = await persistence.getSession(sessionKey);

    if (session && session.completed) {
      const restart = global.confirm(
        `Found completed local data for ${task} subject ${subject}. Start a fresh local session?`
      );

      if (!restart) {
        return { aborted: true };
      }

      await persistence.clearSession(sessionKey);
      session = null;
    }

    if (session && session.trials.length > 0) {
      const resume = global.confirm(
        `Found ${session.trials.length} saved trial(s) for ${task} subject ${subject}. Resume from the next trial?`
      );

      if (resume) {
        return {
          aborted: false,
          resumeIndex: session.trials.length,
          savedTrials: session.trials,
          sessionId: session.sessionId
        };
      }

      await persistence.clearSession(sessionKey);
    }

    const sessionId = crypto.randomUUID();
    await persistence.initializeSession({
      sessionKey,
      sessionId,
      subject,
      task,
      totalTrials
    });

    return {
      aborted: false,
      resumeIndex: 0,
      savedTrials: [],
      sessionId
    };
  }

  function configureDebugExitKey(onKeyDown) {
    if (activeDebugKeyHandler) {
      global.removeEventListener("keydown", activeDebugKeyHandler);
      activeDebugKeyHandler = null;
    }

    if (!onKeyDown) {
      return;
    }

    activeDebugKeyHandler = onKeyDown;
    global.addEventListener("keydown", activeDebugKeyHandler);
  }

  function replaySsd(savedTrials) {
    const lastStopTrial = savedTrials
      .filter((trial) => trial.condition === "stop" && Number.isFinite(trial.ssd_after_ms))
      .sort((a, b) => a.trial - b.trial)
      .at(-1);

    return lastStopTrial ? lastStopTrial.ssd_after_ms : timing.initialSsd;
  }

  function makeInstructionChoice() {
    let includeInstructions = false;

    return {
      get value() {
        return includeInstructions;
      },
      trial: {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `
          <div class="stop-message">
            <h1>Welcome</h1>
            <p>You can read the instructions and complete practice trials, or skip directly to the main task if you already know this version.</p>
            <div class="button-row">
              <button type="button" id="with-instructions">Instructions and practice</button>
              <button type="button" id="skip-instructions">Skip to task</button>
            </div>
          </div>
        `,
        choices: "NO_KEYS",
        on_load: () => {
          document.getElementById("with-instructions").addEventListener("click", () => {
            includeInstructions = true;
            activeJsPsych.finishTrial();
          });
          document.getElementById("skip-instructions").addEventListener("click", () => {
            includeInstructions = false;
            activeJsPsych.finishTrial();
          });
        }
      }
    };
  }

  function renderRuleRows(rows) {
    return `
      <div class="instruction-rules">
        ${rows
          .map((row) => `
            <div class="instruction-rule">
              <div class="instruction-rule-label">${row.label}</div>
              <div class="instruction-rule-value">${row.value}</div>
            </div>
          `)
          .join("")}
      </div>
    `;
  }

  function renderGoKeyRows(task) {
    return renderRuleRows(
      task.responseKeys.map((key) => ({
        label: key.toUpperCase(),
        value: task.keyLabels[key]
      }))
    );
  }

  function renderSignalIntro(task) {
    if (task.id === "stimulus_selective") {
      return `
        <p>You have practiced pressing the arrow keys.</p>
        <p>Now there is one more thing to watch for. On some trials, the circle around the arrow may change color shortly after the arrow appears.</p>
        <p>There are two possible colors, and each color has its own rule.</p>
      `;
    }

    return `
      <p>You have practiced pressing the arrow keys.</p>
      <p>Now there is one more thing to watch for. On some trials, the circle around the arrow may turn blue shortly after the arrow appears.</p>
      <p>When you see the blue circle, use the blue rule.</p>
    `;
  }

  function renderSignalRule(task) {
    if (task.id === "stop_change_two") {
      return `
        <p>Blue means switch to the other direction key.</p>
        <p>Keep responding to the arrow, but switch to the other key when the blue circle appears.</p>
        ${renderRuleRows([
          { label: "Left arrow + blue circle", value: `Press ${task.goKeys.right.toUpperCase()}` },
          { label: "Right arrow + blue circle", value: `Press ${task.goKeys.left.toUpperCase()}` }
        ])}
      `;
    }

    if (task.id === "stop_change_three") {
      return `
        <p>Blue means use the change key.</p>
        <p>Keep responding to the arrow, but press <strong>M</strong> when the blue circle appears.</p>
        ${renderRuleRows([
          { label: "Any arrow + blue circle", value: "Press M" }
        ])}
      `;
    }

    if (task.id === "stop_change_four") {
      const rule = task.stopRules[0];

      return `
        <p>Blue means use the change keys instead of the ordinary arrow keys.</p>
        <p>Keep responding to the arrow, but use the matching change key when the blue circle appears.</p>
        ${renderRuleRows([
          { label: "Left arrow + blue circle", value: `Press ${rule.changeKeys.left.toUpperCase()}` },
          { label: "Right arrow + blue circle", value: `Press ${rule.changeKeys.right.toUpperCase()}` }
        ])}
      `;
    }

    return `
      <p>Use the color to decide whether to stop or continue.</p>
      ${renderRuleRows([
        { label: "Red circle", value: "Do not press any key" },
        { label: "Blue circle", value: "Press the normal arrow key" }
      ])}
    `;
  }

  function renderColorPracticeDescription(task) {
    if (task.id === "stimulus_selective") {
      return "Practice block 2: focus on the red and blue circles. If red appears, do not press a key. If blue appears, press the arrow key.";
    }

    return "Practice block 2: focus on blue circles. Keep responding to the arrow, and use the blue rule when blue appears.";
  }

  function makeGoInstructionPages(task) {
    return {
      type: jsPsychInstructions,
      pages: [
        `
          <h2>Welcome</h2>
          <p>In this task, you will respond to arrows on the screen.</p>
          <p>Try to respond quickly, while still pressing the correct key.</p>
          <p>Keep your eyes near the center of the screen and keep your fingers on the response keys.</p>
        `,
        `
          <h2>Arrow Trials</h2>
          <p>Each trial starts with a fixation cross.</p>
          <p>Then an arrow appears inside a circle. Press the key that matches the arrow direction.</p>
          ${renderGoKeyRows(task)}
        `,
        `
          <h2>First Practice</h2>
          <p>First, you will practice this arrow rule by itself.</p>
          <p>Use this practice block to get comfortable with the keys.</p>
        `
      ],
      show_clickable_nav: true
    };
  }

  function makeSignalInstructionPages(task) {
    return {
      type: jsPsychInstructions,
      pages: [
        `
          <h2>Color Changes</h2>
          ${renderSignalIntro(task)}
        `,
        `
          <h2>Color Rule</h2>
          ${renderSignalRule(task)}
        `,
        `
          <h2>Respond First</h2>
          <p>Do not wait to see whether a color change will happen.</p>
          <p>Start each trial by responding to the arrow. If the circle changes color, use the color rule.</p>
        `,
        `
          <h2>Difficulty</h2>
          <p>The color change is delayed, so using it will sometimes be difficult.</p>
          <p>The delay changes during the task. The goal is for the color rule to be successful only about half of the time.</p>
          <p>This is expected. Keep responding quickly and do not wait for a possible color change.</p>
        `,
        `
          <h2>Practice</h2>
          <p>Next, you will practice the color rule.</p>
          <p>After that, you will practice the full task: some trials are arrows only, and some include a color change.</p>
        `
      ],
      show_clickable_nav: true
    };
  }

  function makeGoPracticeRows(count) {
    const directions = ["left", "right"];

    return Array.from({ length: count }, (_, index) => ({
      trial_type: "go",
      stop_rule: "none",
      signal: "none",
      direction: directions[index % directions.length]
    }));
  }

  function makeStopPracticeRows(task, count) {
    const rows = [];
    const directions = ["left", "right"];

    for (let index = 0; index < count; index += 1) {
      const rule = task.stopRules[index % task.stopRules.length];

      rows.push({
        trial_type: "stop",
        stop_rule: rule.id,
        signal: rule.signal,
        direction: directions[Math.floor(index / task.stopRules.length) % directions.length]
      });
    }

    return rows;
  }

  function interleaveRows(firstRows, secondRows) {
    const rows = [];
    const maxLength = Math.max(firstRows.length, secondRows.length);

    for (let index = 0; index < maxLength; index += 1) {
      if (index < firstRows.length) {
        rows.push(firstRows[index]);
      }

      if (index < secondRows.length) {
        rows.push(secondRows[index]);
      }
    }

    return rows;
  }

  function makePracticeTrials(task, mode) {
    const rows = mode === "go"
      ? makeGoPracticeRows(10)
      : mode === "color"
        ? makeStopPracticeRows(task, 10)
        : interleaveRows(makeGoPracticeRows(10), makeStopPracticeRows(task, 10));

    return rows.map((row, index) => {
      const intended = definitions.getIntendedResponse(task, row);

      return {
        ...row,
        trial: index + 1,
        go_key: task.goKeys[row.direction],
        intended_action: intended.intended_action,
        intended_key: intended.intended_key,
        requires_signal_for_success: intended.requires_signal_for_success,
        fixation_duration: timing.fixationDuration,
        response_window: timing.responseWindow,
        iti: timing.iti
      };
    });
  }

  function makeBlockIntro(text) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `<div class="stop-message"><p>${text}</p><p>Press space to start.</p></div>`,
      choices: [" "]
    };
  }

  function groupTrialsByBlock(trials) {
    const grouped = new Map();

    trials.forEach((trial) => {
      const block = Number(trial.block);

      if (!grouped.has(block)) {
        grouped.set(block, []);
      }

      grouped.get(block).push(trial);
    });

    return Array.from(grouped, ([block, blockTrials]) => ({ block, trials: blockTrials }))
      .sort((a, b) => a.block - b.block);
  }

  function makeBlockBreak(block, totalBlocks) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `
        <div class="stop-message">
          <p>You have finished block ${block} of ${totalBlocks}.</p>
          <p>Press space to continue.</p>
        </div>
      `,
      choices: [" "]
    };
  }

  function makePracticeIntro(mode, task) {
    if (mode === "go") {
      return makeBlockIntro(
        "Practice block 1: press the key for the arrow direction."
      );
    }

    if (mode === "color") {
      return makeBlockIntro(renderColorPracticeDescription(task));
    }

    return makeBlockIntro(
      "Practice block 3: mixed trials. Some trials are arrows only, and some include a color change. Keep responding to the arrow, and use the color rule when a color appears."
    );
  }

  function makeParticipationMonitor() {
    let missedGoTrials = 0;
    let warningPending = false;

    return {
      observe(data) {
        if (data.condition !== "go") {
          return;
        }

        if (data.response_key === null) {
          missedGoTrials += 1;

          if (missedGoTrials >= 3) {
            missedGoTrials = 0;
            warningPending = true;
          }

          return;
        }

        missedGoTrials = 0;
      },
      consumeWarning() {
        const shouldWarn = warningPending;
        warningPending = false;
        return shouldWarn;
      }
    };
  }

  function makeParticipationWarningTrial(participationMonitor) {
    return {
      timeline: [
        {
          type: jsPsychHtmlKeyboardResponse,
          stimulus: `
            <div class="stop-message">
              <h2>Please stay engaged</h2>
              <p>We have detected several missed responses on arrow-only trials.</p>
              <p>If you are no longer actively participating in the experiment, this may lead to loss of compensation.</p>
              <p>Press space to continue.</p>
            </div>
          `,
          choices: [" "]
        }
      ],
      conditional_function: () => participationMonitor.consumeWarning()
    };
  }

  function makeTrialsProcedure(jsPsych, task, trials, phase, block, getSsd, updateSsd, participationMonitor = null) {
    const fixationTrial = {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `<div class="fixation-stage"><div class="fixation-marker">+</div></div>`,
      choices: "NO_KEYS",
      trial_duration: jsPsych.timelineVariable("fixation_duration")
    };

    const responseTrial = {
      type: jsPsychStopSignalResponse,
      task_name: task.id,
      phase,
      block,
      trial_index: jsPsych.timelineVariable("trial"),
      trial_type: jsPsych.timelineVariable("trial_type"),
      stop_rule: jsPsych.timelineVariable("stop_rule"),
      signal: jsPsych.timelineVariable("signal"),
      direction: jsPsych.timelineVariable("direction"),
      response_keys: task.responseKeys,
      key_labels: task.keyLabels,
      keyboard_order: definitions.KEYBOARD_ORDER,
      go_key: jsPsych.timelineVariable("go_key"),
      intended_action: jsPsych.timelineVariable("intended_action"),
      intended_key: jsPsych.timelineVariable("intended_key"),
      requires_signal_for_success: jsPsych.timelineVariable("requires_signal_for_success"),
      response_window: jsPsych.timelineVariable("response_window"),
      on_start: (trial) => {
        trial.ssd = getSsd();
      },
      on_finish: (data) => {
        if (data.condition !== "stop") {
          if (participationMonitor) {
            participationMonitor.observe(data);
          }

          return;
        }

        const nextSsd = data.stop_success
          ? getSsd() + timing.ssdStep
          : Math.max(timing.minSsd, getSsd() - timing.ssdStep);

        data.ssd_after = nextSsd;
        updateSsd(nextSsd);
      }
    };

    const itiTrial = {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: "",
      choices: "NO_KEYS",
      trial_duration: jsPsych.timelineVariable("iti")
    };
    const practiceFeedbackTrial = {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: () => {
        const lastTrial = jsPsych.data.get().last(1).values()[0];
        const feedback = lastTrial.correct ? "Correct" : "Wrong";
        const feedbackClass = lastTrial.correct ? "practice-feedback-correct" : "practice-feedback-wrong";

        return `<div class="practice-feedback ${feedbackClass}">${feedback}</div>`;
      },
      choices: "NO_KEYS",
      trial_duration: 600
    };
    const timeline = phase === "practice"
      ? [fixationTrial, responseTrial, practiceFeedbackTrial, itiTrial]
      : [fixationTrial, responseTrial, makeParticipationWarningTrial(participationMonitor), itiTrial];

    return {
      timeline,
      timeline_variables: trials
    };
  }

  function makeMainTimeline(jsPsych, task, trials, totalBlocks, getSsd, updateSsd) {
    const timeline = [];
    const participationMonitor = makeParticipationMonitor();

    groupTrialsByBlock(trials).forEach(({ block, trials: blockTrials }) => {
      timeline.push(makeTrialsProcedure(
        jsPsych,
        task,
        blockTrials,
        "main",
        jsPsych.timelineVariable("block"),
        getSsd,
        updateSsd,
        participationMonitor
      ));

      timeline.push(makeBlockBreak(block, totalBlocks));
    });

    return timeline;
  }

  async function boot() {
    const { task: taskId, subject } = getQueryConfig();
    const task = definitions.getTask(taskId);
    const sessionKey = `${task.id}-${String(subject).padStart(3, "0")}`;

    try {
      const rawDesign = await global.stopMissionLoadDesign(task.id, subject);
      const design = normalizeDesign(rawDesign, task);
      const totalBlocks = Math.max(...design.map((trial) => Number(trial.block)));
      const session = await prepareSession(sessionKey, task.id, subject, design.length);

      if (session.aborted) {
        renderMessage("Local session left unchanged. Reload when you want to run it.");
        return;
      }

      const remainingTrials = design.slice(session.resumeIndex);
      let mainSsd = replaySsd(session.savedTrials);
      let practiceSsd = timing.initialSsd;

      await syncBufferedTrials(sessionKey);

      if (remainingTrials.length === 0) {
        renderMessage("No remaining trials in the local buffer for this session.");
        return;
      }

      sessionWasAborted = false;
      const jsPsych = initJsPsych({
        display_element: "jspsych-target",
        on_data_update: (data) => {
          if (data.record_type === "response_trial") {
            persistResponseTrial(sessionKey, sanitizeTrialRecord(data, session.sessionId));
            return;
          }

          if (data.record_type === "practice_trial") {
            persistence.postRecord(sanitizeTrialRecord(data, session.sessionId)).catch((error) => {
              console.error(error);
            });
          }
        },
        on_finish: () => {
          configureDebugExitKey(null);
          activeJsPsych = null;

          if (sessionWasAborted) {
            return;
          }

          persistence.markSessionComplete(sessionKey).catch((error) => {
            console.error(error);
          });
        }
      });
      activeJsPsych = jsPsych;

      jsPsych.data.addProperties({
        task: task.id,
        subject,
        session_id: session.sessionId
      });

      configureDebugExitKey(async (event) => {
        if (event.key !== "Escape") {
          return;
        }

        event.preventDefault();

        const shouldExit = global.confirm(
          "Exit the experiment now? Your completed main-task trials will be kept, and you can reload this URL to resume later."
        );

        if (!shouldExit || !activeJsPsych) {
          return;
        }

        sessionWasAborted = true;
        activeJsPsych.abortExperiment(
          "<p>Experiment exited.</p><p>Reload this URL to resume from the next unsaved trial.</p>"
        );
        configureDebugExitKey(null);
        activeJsPsych = null;
      });

      const instructionChoice = makeInstructionChoice();
      const instructionAndPractice = {
        timeline: [
          makeGoInstructionPages(task),
          makePracticeIntro("go", task),
          makeTrialsProcedure(
            jsPsych,
            task,
            makePracticeTrials(task, "go"),
            "practice",
            "practice_go",
            () => practiceSsd,
            (value) => {
              practiceSsd = value;
            }
          ),
          makeSignalInstructionPages(task),
          makePracticeIntro("color", task),
          makeTrialsProcedure(
            jsPsych,
            task,
            makePracticeTrials(task, "color"),
            "practice",
            "practice_color",
            () => practiceSsd,
            (value) => {
              practiceSsd = value;
            }
          ),
          makePracticeIntro("mixed", task),
          makeTrialsProcedure(
            jsPsych,
            task,
            makePracticeTrials(task, "mixed"),
            "practice",
            "practice_mixed",
            () => practiceSsd,
            (value) => {
              practiceSsd = value;
            }
          )
        ],
        conditional_function: () => instructionChoice.value
      };

      const startMain = makeBlockIntro(
        `${task.title}. ${session.resumeIndex > 0 ? `Resuming from trial ${session.resumeIndex + 1}.` : "Starting from trial 1."}`
      );

      const mainTimeline = makeMainTimeline(
        jsPsych,
        task,
        remainingTrials,
        totalBlocks,
        () => mainSsd,
        (value) => {
          mainSsd = value;
        }
      );

      const endScreen = {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: "<p>Experiment complete.</p><p>Press space to finish.</p>",
        choices: [" "]
      };

      jsPsych.run([instructionChoice.trial, instructionAndPractice, startMain, ...mainTimeline, endScreen]);
    } catch (error) {
      console.error(error);
      renderMessage("Failed to start the experiment. Check the console for details.");
    }
  }

  global.addEventListener("load", boot);
})(window);
