(function registerStopChangeTwo(root, factory) {
  const task = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = task;
    return;
  }

  root.stopTaskSpecs = root.stopTaskSpecs || [];
  root.stopTaskSpecs.push(task);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStopChangeTwo() {
  return {
    id: "stop_change_two",
    title: "Stop change with two buttons",
    orientationResponseKeys: ["left_shift", "left_inner"],
    responseKeys: ["left_shift", "left_inner"],
    stopRules: [
      {
        id: "opposite",
        signal: "blue",
        weight: 1,
        outcome: "opposite_orientation_key",
        requiresSignalForSuccess: true
      }
    ],
    instructions: {
      timingDifficulty: "The circle turns blue after the symbol appears, so it may sometimes be difficult to change your response in time.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns blue shortly after the symbol appears. These are change trials.</p>
        <p>On a change trial, respond with the other response key.</p>
        <p>That is, when the circle is is black, respond as usual. But when the circle turns blue, respond with the other response key.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a change trial, when the circle turns blue, press the other response key.</p>
          ${helpers.renderStimulusActionRows(task, [
            { orientation: "normal", signal: "blue", key: task.orientationKeys.rotated },
            { orientation: "rotated", signal: "blue", key: task.orientationKeys.normal }
          ])}
        `;
      },
      signalPracticeDescription:
        "Press the matching response key. On change trials, when the circle turns blue, press the other response key."
    }
  };
});
