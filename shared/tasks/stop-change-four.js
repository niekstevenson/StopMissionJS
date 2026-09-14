(function registerStopChangeFour(root, factory) {
  const task = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = task;
    return;
  }

  root.stopTaskSpecs = root.stopTaskSpecs || [];
  root.stopTaskSpecs.push(task);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStopChangeFour() {
  return {
    id: "stop_change_four",
    title: "Stop change with four buttons",
    orientationResponseKeys: ["left_shift", "left_inner"],
    fillResponseKeys: ["right_inner", "right_shift"],
    responseKeys: ["left_shift", "left_inner", "right_inner", "right_shift"],
    useFillDimension: true,
    stopRules: [
      {
        id: "fill_change",
        signal: "blue",
        weight: 1,
        outcome: "fill_key",
        requiresSignalForSuccess: true
      }
    ],
    instructions: {
      timingDifficulty: "The circle turns blue after the symbol appears, so it may sometimes be difficult to change your response in time.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns blue shortly after the symbol appears. These are change trials.</p>
        <p>On a change trial, use the two picture keys on the right side of the keyboard.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a change trial, when the circle turns blue, choose between the two picture keys on the right.</p>
          ${helpers.renderFillResponseExamples(task)}
        `;
      },
      signalPracticeDescription:
        "Press the matching picture key. On change trials, when the circle turns blue, use the matching picture key on the right side."
    }
  };
});
