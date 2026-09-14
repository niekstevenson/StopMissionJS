(function registerStopSignal(root, factory) {
  const task = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = task;
    return;
  }

  root.stopTaskSpecs = root.stopTaskSpecs || [];
  root.stopTaskSpecs.push(task);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStopSignal() {
  return {
    id: "stop_signal",
    title: "Stop-signal",
    orientationResponseKeys: ["left_shift", "left_inner"],
    responseKeys: ["left_shift", "left_inner"],
    stopRules: [
      {
        id: "withhold",
        signal: "red",
        weight: 1,
        outcome: "withhold",
        requiresSignalForSuccess: false
      }
    ],
    instructions: {
      timingDifficulty: "The circle turns red after the symbol appears, so it may sometimes be difficult to stop yourself from responding.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns red shortly after the symbol appears. These are stop trials.</p>
        <p>On a stop trial, try to stop yourself from pressing a key.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a stop trial, when the circle turns red, do not press any response key.</p>
          ${helpers.renderStimulusActionRows(task, [
            { orientation: "normal", signal: "red", responseText: "Do not press any key" },
            { orientation: "rotated", signal: "red", responseText: "Do not press any key" }
          ])}
        `;
      },
      signalPracticeDescription:
        "Press the matching picture key. On stop trials, when the circle turns red, try not to press any response key."
    }
  };
});
