(function attachKeyMapping(global) {
  const SHIFT_CODES = new Set(["ShiftLeft", "ShiftRight"]);

  const HAND_SCREENS = [
    {
      title: "Keyboard setup",
      text: "First, set the response keys on the left side of your keyboard.",
      slots: ["left_shift", "left_inner"],
      steps: [
        {
          slot: "left_shift",
          label: "Left Shift",
          prompt: "Press Left Shift.",
          requiredCode: "ShiftLeft",
          error: "That was not Left Shift. Press the Shift key on the left side of your keyboard."
        },
        {
          slot: "left_inner",
          label: "Key to the right of Left Shift",
          prompt: "Press the key immediately to the right of Left Shift.",
          rejectShift: true,
          error: "That was a Shift key. Press the key immediately to the right of Left Shift."
        }
      ]
    },
    {
      title: "Keyboard setup",
      text: "This task also uses response keys on the right side of your keyboard.",
      slots: ["right_inner", "right_shift"],
      steps: [
        {
          slot: "right_shift",
          label: "Right Shift",
          prompt: "Press Right Shift.",
          requiredCode: "ShiftRight",
          error: "That was not Right Shift. Press the Shift key on the right side of your keyboard."
        },
        {
          slot: "right_inner",
          label: "Key to the left of Right Shift",
          prompt: "Press the key immediately to the left of Right Shift.",
          rejectShift: true,
          error: "That was a Shift key. Press the key immediately to the left of Right Shift."
        }
      ]
    }
  ];

  const SLOT_NAMES = Object.fromEntries(
    HAND_SCREENS.flatMap((screen) => screen.steps.map((step) => [step.slot, step.label]))
  );

  function needsRightHand(task) {
    return task.responseKeys.some((key) => key.startsWith("right_"));
  }

  function getScreens(task) {
    return needsRightHand(task) ? HAND_SCREENS : [HAND_SCREENS[0]];
  }

  function renderIntro(target, task) {
    const rightHandText = needsRightHand(task)
      ? "This task will use keys on both sides of the keyboard."
      : "This task will use two keys on the left side of the keyboard.";

    return new Promise((resolve) => {
      target.innerHTML = `
        <div class="stop-message keymap-message">
          <h1>Welcome</h1>
          <p>Keyboard layouts can differ, so we need to check the exact keys you will use for this task.</p>
          <p>${rightHandText}</p>
          <p>On the next screen, press the keys exactly as requested.</p>
          <div class="button-row">
            <button type="button" data-keymap-start>Set response keys</button>
          </div>
        </div>
      `;

      target.querySelector("[data-keymap-start]").addEventListener("click", resolve);
    });
  }

  function formatKeyLabel(event) {
    if (event.code === "ShiftLeft") {
      return "Left Shift";
    }

    if (event.code === "ShiftRight") {
      return "Right Shift";
    }

    if (event.key === " ") {
      return "Space";
    }

    if (event.key && event.key !== "Unidentified") {
      return event.key.length === 1 ? event.key.toUpperCase() : event.key;
    }

    return event.code;
  }

  function makeKeyRecord(event) {
    return {
      code: event.code,
      key: event.key,
      label: formatKeyLabel(event)
    };
  }

  function validateKey(event, step, mapping) {
    if (!event.code) {
      return "This browser did not identify the physical key. Please use a current version of Chrome, Edge, Firefox, or Safari.";
    }

    if (step.requiredCode && event.code !== step.requiredCode) {
      return step.error;
    }

    if (step.rejectShift && SHIFT_CODES.has(event.code)) {
      return step.error;
    }

    if (Object.values(mapping).some((record) => record.code === event.code)) {
      return "That key has already been recorded. Press the requested key that has not been recorded yet.";
    }

    return "";
  }

  function renderScreen(target, screen, mapping, activeStepIndex, error = "") {
    const activeSlot = screen.steps[activeStepIndex]?.slot || "";
    const complete = activeStepIndex >= screen.steps.length;
    const prompt = complete
      ? "The keys on this side have been recorded. Continue when you are ready."
      : screen.steps[activeStepIndex].prompt;

    target.innerHTML = `
      <div class="stop-message keymap-message">
        <h1>${screen.title}</h1>
        <p>${screen.text}</p>
        <div class="keymap-keys">
          ${screen.slots.map((slot) => {
            const record = mapping[slot];
            const classes = [
              "keymap-key",
              slot === activeSlot ? "keymap-key-active" : "",
              record ? "keymap-key-captured" : ""
            ].filter(Boolean).join(" ");

            return `
              <div class="${classes}">
                <div class="keymap-key-name">${SLOT_NAMES[slot]}</div>
                <div class="keymap-key-value">${record ? record.label : "Not set"}</div>
              </div>
            `;
          }).join("")}
        </div>
        <p class="keymap-prompt">${prompt}</p>
        <p class="keymap-error" aria-live="polite">${error}</p>
        <div class="button-row">
          <button type="button" data-keymap-reset>Start this side again</button>
          <button type="button" data-keymap-continue ${complete ? "" : "disabled"}>Continue</button>
        </div>
      </div>
    `;
  }

  function collectScreen(target, screen, mapping) {
    let activeStepIndex = 0;

    return new Promise((resolve) => {
      const resetSlots = () => {
        screen.slots.forEach((slot) => {
          delete mapping[slot];
        });
        activeStepIndex = 0;
      };

      const refresh = (error = "") => {
        renderScreen(target, screen, mapping, activeStepIndex, error);

        target.querySelector("[data-keymap-reset]").addEventListener("click", () => {
          resetSlots();
          refresh();
        });

        target.querySelector("[data-keymap-continue]").addEventListener("click", () => {
          global.removeEventListener("keydown", onKeyDown);
          resolve();
        });
      };

      const onKeyDown = (event) => {
        if (event.repeat || activeStepIndex >= screen.steps.length) {
          return;
        }

        event.preventDefault();
        const step = screen.steps[activeStepIndex];
        const error = validateKey(event, step, mapping);

        if (error) {
          refresh(error);
          return;
        }

        mapping[step.slot] = makeKeyRecord(event);
        activeStepIndex += 1;
        refresh();
      };

      global.addEventListener("keydown", onKeyDown);
      refresh();
    });
  }

  async function collect(task) {
    const target = document.getElementById("jspsych-target");
    const mapping = {};

    await renderIntro(target, task);

    for (const screen of getScreens(task)) {
      await collectScreen(target, screen, mapping);
    }

    target.innerHTML = "";
    return mapping;
  }

  global.stopMissionKeyMapping = {
    collect,
    needsRightHand
  };
})(window);
