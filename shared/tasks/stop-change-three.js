(function registerStopChangeThree(root, factory) {
  const task = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = task;
    return;
  }

  root.stopTaskSpecs = root.stopTaskSpecs || [];
  root.stopTaskSpecs.push(task);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStopChangeThree() {
  return {
    id: "stop_change_three",
    title: "Stop change with three buttons",
    orientationResponseKeys: ["left_shift", "left_inner"],
    responseKeys: ["left_shift", "left_inner", "right_shift"],
    changeKey: "right_shift",
    stopRules: [
      {
        id: "change",
        signal: "blue",
        weight: 1,
        outcome: "fixed_key",
        key: "right_shift",
        requiresSignalForSuccess: true
      }
    ],
    instructions: {
      timingDifficulty: "The circle turns blue after the symbol appears, so it may sometimes be difficult to change your response in time.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns blue shortly after the symbol appears. These are change trials.</p>
        <p>On a change trial, press the key marked with the blue square, no matter which symbol is inside the circle.</p>
        <p>That is, when the circle is is black, respond as usual. But when the circle turns blue, press the key marked with the blue square with your other hand.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a change trial, when the circle turns blue, press the key marked with the blue square.</p>
        ${helpers.renderStimulusActionRows(task, [
         { orientations: ["normal", "rotated"], signal: "blue", key: task.changeKey }
          ])}
        `;
      },
      signalPracticeDescription:
        "Press the matching picture key. On change trials, when the circle turns blue, press the key marked with the blue square."
    }
  };
});
