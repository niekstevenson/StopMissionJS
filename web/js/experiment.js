(function runExperiment(global) {
  const definitions = global.stopTaskDefinitions;
  const persistence = global.stopMissionPersistence;
  const keyMappingApi = global.stopMissionKeyMapping;
  const stimulusView = global.stopMissionStimulusView;
  const timing = definitions.TIMING;
  const sessionNamespace = "square";
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
        counterbalance: row.counterbalance,
        orientation_mapping: row.orientation_mapping,
        fill_mapping: row.fill_mapping,
        trial_type: row.trial_type,
        stop_rule: row.stop_rule,
        signal: row.signal,
        orientation: row.orientation,
        fill: row.fill,
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

  function makeSavedTrialRecord(data, sessionId) {
    const stimulusType = data.task_trial_type === "stop" ? `stop_${data.signal}` : "go";

    return {
      task: data.task,
      subject: data.subject,
      session_id: sessionId,
      block: data.block,
      trial: data.trial,
      stimulus_type: stimulusType,
      stimulus_orientation: data.orientation,
      stimulus_fill: data.fill,
      ssd_ms: data.ssd ?? "NA",
      ssd_actual_ms: data.actual_ssd ?? "NA",
      rt_ms: data.rt ?? "NA",
      response: data.response_key ?? "NA",
      task_trial_type: data.task_trial_type,
      ssd_after_ms: data.ssd_after
    };
  }

  function makeSavedKeyMapping(task, subject, sessionId, keyMapping) {
    const record = {
      task: task.id,
      subject,
      session_id: sessionId
    };

    definitions.KEYBOARD_ORDER.forEach((slot) => {
      record[`${slot}_code`] = keyMapping[slot]?.code || "";
      record[`${slot}_key`] = keyMapping[slot]?.key || "";
      record[`${slot}_label`] = keyMapping[slot]?.label || "";
    });

    return record;
  }

  async function syncBufferedTrials(sessionKey) {
    const session = await persistence.getSession(sessionKey);

    if (!session) {
      return;
    }

    const bufferedTrials = session.trials.filter((trial) => !trial.server_saved);

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

    if (session) {
      return {
        aborted: false,
        resumeIndex: 0,
        savedTrials: [],
        sessionId: session.sessionId
      };
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
      .filter((trial) => trial.task_trial_type === "stop" && Number.isFinite(trial.ssd_after_ms))
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
            <p>You can read the instructions and complete practice trials before the main task.</p>
            <p>Choose the practice option unless the researcher has told you to skip it.</p>
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

  function renderKeyboardGuide(task, keyMapping, responseKeys = task.responseKeys) {
    return stimulusView.renderKeyboard({
      keyboardOrder: definitions.KEYBOARD_ORDER,
      responseKeys,
      keyMapping,
      keyAssignments: task.keyAssignments,
      className: "instruction-keyboard-row"
    });
  }

  function renderTrialPreview() {
    return `
      <div class="trial-preview">
        <div class="trial-preview-step">
          <div class="trial-preview-fixation">+</div>
        </div>
        <div class="trial-preview-step">
          ${stimulusView.renderStimulus({
            orientation: "normal",
            className: "instruction-stimulus"
          })}
        </div>
      </div>
    `;
  }

  function renderStimulusActionRows(task, keyMapping, rows) {
    return `
      <div class="stimulus-action-grid">
        ${rows.map((row) => `
          <div class="stimulus-action-row">
            ${stimulusView.renderStimulus({
              orientation: row.orientation,
              fill: row.fill || "unfilled",
              signal: row.signal || "none",
              className: "instruction-stimulus"
            })}
            <div class="stimulus-action-response">
              ${row.key
                ? stimulusView.renderResponseKey(row.key, keyMapping, task.keyAssignments[row.key], { compact: true })
                : `<div class="no-response-box">${row.responseText}</div>`}
              ${row.note ? `<div class="stimulus-action-note">${row.note}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderGoResponseExamples(task, keyMapping) {
    return renderStimulusActionRows(
      task,
      keyMapping,
      definitions.STIMULUS.orientations.map((orientation) => ({
        orientation,
        key: task.orientationKeys[orientation]
      }))
    );
  }

  function renderFillResponseExamples(task, keyMapping) {
    return renderStimulusActionRows(
      task,
      keyMapping,
      definitions.STIMULUS.fills.map((fill) => ({
        orientation: "normal",
        fill,
        signal: "blue",
        key: task.fillKeys[fill]
      }))
    );
  }

  function getInstructionHelpers(keyMapping) {
    return {
      renderFillResponseExamples: (task) => renderFillResponseExamples(task, keyMapping),
      renderGoResponseExamples: (task) => renderGoResponseExamples(task, keyMapping),
      renderKeyboardGuide: (task) => renderKeyboardGuide(task, keyMapping),
      renderStimulusActionRows: (task, rows) => renderStimulusActionRows(task, keyMapping, rows)
    };
  }

  function makeGoInstructionPages(task, keyMapping) {
    return {
      type: jsPsychInstructions,
      pages: [
        `
          <h2>Welcome</h2>
          <p>On each trial, a symbol appears at the center of the screen.</p>
          <p>Press the correct response key as soon as you know the answer.</p>
          <p>Respond quickly, but do not guess before the symbol appears.</p>
        `,
        `
          <h2>Match the Symbol</h2>
          <p>The two picture keys below are your response keys.</p>
          <p>When a symbol appears, press the key with the matching picture.</p>
          ${renderGoResponseExamples(task, keyMapping)}
        `,
        `
          <h2>Trial Timing</h2>
          <p>Each trial begins with a plus sign at the center of the screen.</p>
          <p>Keep your eyes there. The symbol will appear in the same place.</p>
          ${renderTrialPreview()}
        `,
        `
          <h2>Your Response Keys</h2>
          <p>Keep your fingers resting on the two picture keys shown below.</p>
          ${renderKeyboardGuide(task, keyMapping, task.orientationResponseKeys)}
        `
      ],
      show_clickable_nav: true
    };
  }

  function makeSignalInstructionPages(task, keyMapping) {
    return {
      type: jsPsychInstructions,
      pages: [
        `
          <h2>Color Changes</h2>
          ${task.instructions.signalIntro}
        `,
        `
          <h2>How to Respond</h2>
          ${task.instructions.signalRule(task, getInstructionHelpers(keyMapping))}
          ${renderKeyboardGuide(task, keyMapping)}
        `,
        `
          <h2>Keep the Same Pace</h2>
          <p>${task.instructions.timingDifficulty}</p>
          <p>Do not slow down or wait to see whether the circle changes color. Respond to the symbol right away, and follow the new rule when you can.</p>
        `
      ],
      show_clickable_nav: true
    };
  }

  const PRACTICE_STIMULUS_PATTERN = [
    { orientation: "normal", fill: "filled" },
    { orientation: "normal", fill: "unfilled" },
    { orientation: "rotated", fill: "filled" },
    { orientation: "normal", fill: "filled" },
    { orientation: "rotated", fill: "unfilled" },
    { orientation: "rotated", fill: "unfilled" },
    { orientation: "rotated", fill: "filled" },
    { orientation: "normal", fill: "unfilled" },
    { orientation: "rotated", fill: "unfilled" },
    { orientation: "normal", fill: "filled" }
  ];

  function getPracticeStimulus(task, index, offset) {
    const stimulus = PRACTICE_STIMULUS_PATTERN[(index + offset) % PRACTICE_STIMULUS_PATTERN.length];
    const fill = task.useFillDimension ? stimulus.fill : "unfilled";

    return { orientation: stimulus.orientation, fill };
  }

  function makeGoPracticeRows(count) {
    return Array.from({ length: count }, () => ({
      trial_type: "go",
      stop_rule: "none",
      signal: "none"
    }));
  }

  function makeStopPracticeRows(task, count) {
    const rows = [];

    for (let index = 0; index < count; index += 1) {
      const rule = task.stopRules[index % task.stopRules.length];

      rows.push({
        trial_type: "stop",
        stop_rule: rule.id,
        signal: rule.signal
      });
    }

    return rows;
  }

  function makeMixedPracticeRows(task, goCount, stopCount) {
    const goRows = makeGoPracticeRows(goCount);
    const stopRows = makeStopPracticeRows(task, stopCount);
    const rows = [];
    let goIndex = 0;
    let stopIndex = 0;
    const total = goCount + stopCount;

    for (let index = 0; index < total; index += 1) {
      const targetStopCount = Math.floor(((index + 1) * stopCount) / total);

      if (stopIndex < targetStopCount) {
        rows.push(stopRows[stopIndex]);
        stopIndex += 1;
      } else {
        rows.push(goRows[goIndex]);
        goIndex += 1;
      }
    }

    return rows;
  }

  function makePracticeTrials(task, mode) {
    const rows = mode === "go"
      ? makeGoPracticeRows(10)
      : mode === "signal"
        ? makeMixedPracticeRows(task, 8, 8)
        : makeMixedPracticeRows(task, 14, 6);
    const stimulusOffset = mode === "go" ? 0 : mode === "signal" ? 5 : 6;

    return rows.map((row, index) => {
      const practiceRow = {
        ...row,
        ...getPracticeStimulus(task, index, stimulusOffset)
      };
      const intended = definitions.getIntendedResponse(task, practiceRow);

      return {
        ...practiceRow,
        trial: index + 1,
        intended_action: intended.intended_action,
        intended_key: intended.intended_key,
        requires_signal_for_success: intended.requires_signal_for_success,
        fixation_duration: timing.fixationDuration,
        response_window: timing.responseWindow,
        iti: timing.iti
      };
    });
  }

  function makeMainStartTrial(task, resumeIndex) {
    const resumeText = resumeIndex > 0
      ? `<p>The main task will resume at trial ${resumeIndex + 1}.</p>`
      : "";
    const reminder = task.id === "stop_signal"
      ? {
          signal: "stop signal",
          failureLine: "You are expected to fail to stop your response about half of the time."
        }
      : task.id === "stimulus_selective"
        ? {
            signal: "red stop signal",
            failureLine: "On red stop trials, you are expected to fail to stop your response about half of the time.",
            responseLine: "If the circle turns red, try to stop your response in time. If it turns blue, ignore the blue circle and respond to the symbol on screen."
          }
        : {
            signal: "change signal",
            failureLine: "You are expected to fail to change your response about half of the time.",
            responseLine: "If the signal appears, try to change your response in time."
          };

    if (task.id === "stop_signal") {
      reminder.responseLine = "If the signal appears, try to stop your response in time.";
    }

    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `
        <div class="stop-message">
          <h2>End of Practice</h2>
          ${resumeText}
          <p>The main experiment will start now.</p>
          <p>Remember: the ${reminder.signal} appears after a delay.</p>
          <p>Do not wait for the signal. Your goal is to respond as quickly as possible to the symbol.</p>
          <p>The delay adapts during the task. ${reminder.failureLine}</p>
          <p>${reminder.responseLine}</p>
          <p>Press space to start the real experiment.</p>
        </div>
      `,
      choices: [" "]
    };
  }

  function makePracticeBlockIntro(title, text) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `
        <div class="stop-message">
          <h2>${title}</h2>
          <p>${text}</p>
          <p>After each trial, you will get feedback on your response.</p>
          <p>Press space to start.</p>
        </div>
      `,
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
      return makePracticeBlockIntro(
        "Practice 1",
        "Press the key with the picture that matches the symbol on the screen."
      );
    }

    if (mode === "signal") {
      return makePracticeBlockIntro("Practice 2", task.instructions.signalPracticeDescription);
    }

    return makePracticeBlockIntro(
      "Final Practice",
      "Keep responding quickly, and follow the new rule when the circle changes color."
    );
  }

  function makeParticipationMonitor() {
    let missedGoTrials = 0;
    let warningPending = false;

    return {
      observe(data) {
        if (data.task_trial_type !== "go") {
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
              <p>Several recent trials had no response when a response was expected.</p>
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

  function getMainFeedback(data) {
    if (data.task_trial_type === "go" && data.correct === false) {
      return "Wrong";
    }

    if (data.task_trial_type === "stop" && data.stop_success === false) {
      return "Failed Stop";
    }

    return "";
  }

  function makeTrialsProcedure(
    jsPsych,
    task,
    trials,
    phase,
    block,
    getSsd,
    updateSsd,
    keyMapping,
    participationMonitor = null,
    responseKeys = task.responseKeys
  ) {
    const keyboardHtml = stimulusView.renderKeyboard({
      keyboardOrder: definitions.KEYBOARD_ORDER,
      responseKeys,
      keyMapping,
      keyAssignments: task.keyAssignments
    });
    const fixationTrial = {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `<div class="fixation-stage"><div class="fixation-marker">+</div>${keyboardHtml}</div>`,
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
      signal: jsPsych.timelineVariable("signal"),
      orientation: jsPsych.timelineVariable("orientation"),
      fill: jsPsych.timelineVariable("fill"),
      response_keys: responseKeys,
      key_map: keyMapping,
      key_assignments: task.keyAssignments,
      keyboard_order: definitions.KEYBOARD_ORDER,
      intended_action: jsPsych.timelineVariable("intended_action"),
      intended_key: jsPsych.timelineVariable("intended_key"),
      requires_signal_for_success: jsPsych.timelineVariable("requires_signal_for_success"),
      response_window: jsPsych.timelineVariable("response_window"),
      on_start: (trial) => {
        trial.ssd = getSsd();
      },
      on_finish: (data) => {
        if (data.task_trial_type !== "stop") {
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
      stimulus: `<div class="iti-stage">${keyboardHtml}</div>`,
      choices: "NO_KEYS",
      trial_duration: jsPsych.timelineVariable("iti")
    };
    const practiceFeedbackTrial = {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: () => {
        const lastTrial = jsPsych.data.get().last(1).values()[0];
        const feedback = lastTrial.correct ? "Correct" : "Wrong";
        const feedbackClass = lastTrial.correct ? "practice-feedback-correct" : "practice-feedback-wrong";

        return `
          <div class="practice-feedback-stage">
            <div class="practice-feedback ${feedbackClass}">${feedback}</div>
            ${keyboardHtml}
          </div>
        `;
      },
      choices: "NO_KEYS",
      trial_duration: 600
    };
    const mainFeedbackTrial = {
      timeline: [
        {
          type: jsPsychHtmlKeyboardResponse,
          stimulus: () => {
            const lastTrial = jsPsych.data.get().last(1).values()[0];
            const feedback = getMainFeedback(lastTrial);

            return `
              <div class="practice-feedback-stage">
                <div class="practice-feedback practice-feedback-wrong">${feedback}</div>
                ${keyboardHtml}
              </div>
            `;
          },
          choices: "NO_KEYS",
          trial_duration: 600
        }
      ],
      conditional_function: () => {
        const lastTrial = jsPsych.data.get().last(1).values()[0];
        return getMainFeedback(lastTrial) !== "";
      }
    };
    const timeline = phase === "practice"
      ? [fixationTrial, responseTrial, practiceFeedbackTrial, itiTrial]
      : [
          fixationTrial,
          responseTrial,
          mainFeedbackTrial,
          makeParticipationWarningTrial(participationMonitor),
          itiTrial
        ];

    return {
      timeline,
      timeline_variables: trials
    };
  }

  function makeMainTimeline(jsPsych, task, trials, totalBlocks, getSsd, updateSsd, keyMapping) {
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
        keyMapping,
        participationMonitor
      ));

      timeline.push(makeBlockBreak(block, totalBlocks));
    });

    return timeline;
  }

  async function boot() {
    const { task: taskId, subject } = getQueryConfig();
    const task = definitions.getTask(taskId, subject);
    const sessionKey = `${sessionNamespace}-${task.id}-${String(subject).padStart(3, "0")}`;

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

      const keyMapping = await keyMappingApi.collect(task);
      await persistence.saveKeyMapping(sessionKey, keyMapping);
      persistence.postKeyMapping(makeSavedKeyMapping(task, subject, session.sessionId, keyMapping)).catch((error) => {
        console.error(error);
      });

      sessionWasAborted = false;
      const jsPsych = initJsPsych({
        display_element: "jspsych-target",
        on_data_update: (data) => {
          if (data.phase === "main") {
            persistResponseTrial(sessionKey, makeSavedTrialRecord(data, session.sessionId));
            return;
          }

          if (data.phase === "practice") {
            persistence.postRecord(makeSavedTrialRecord(data, session.sessionId)).catch((error) => {
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
          makeGoInstructionPages(task, keyMapping),
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
            },
            keyMapping,
            null,
            task.orientationResponseKeys
          ),
          makeSignalInstructionPages(task, keyMapping),
          makePracticeIntro("signal", task),
          makeTrialsProcedure(
            jsPsych,
            task,
            makePracticeTrials(task, "signal"),
            "practice",
            "practice_signal",
            () => practiceSsd,
            (value) => {
              practiceSsd = value;
            },
            keyMapping
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
            },
            keyMapping
          )
        ],
        conditional_function: () => instructionChoice.value
      };

      const startMain = makeMainStartTrial(task, session.resumeIndex);

      const mainTimeline = makeMainTimeline(
        jsPsych,
        task,
        remainingTrials,
        totalBlocks,
        () => mainSsd,
        (value) => {
          mainSsd = value;
        },
        keyMapping
      );

      const endScreen = {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: "<div class=\"stop-message\"><p>The experiment is complete.</p><p>Press space to finish.</p></div>",
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
