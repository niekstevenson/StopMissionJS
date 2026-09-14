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
      goNote: "<p>Symbols are sometimes hollow and sometimes filled. For now, you can ignore this. Only the shape matters.</p>",
      timingDifficulty: "The circle turns blue after the symbol appears, so it may sometimes be difficult to change your response in time.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns blue shortly after the symbol appears. These are change trials.</p>
        <p>On a change trial, respond with your right hand instead of your left.</p>
        <p>Furthermore, the shape is now irrelevant. Rather, the correct response is now determined by whether the symbols is filled or not.</p>
        <p>That is, when the circle is black, respond as usual. But when the circle turns blue, respond to the fill (hollow / filled) of the symbol, rather than its shape, with your other hand.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a change trial, when the circle turns blue, choose between the two response keys on the right.</p>
          ${helpers.renderFillResponseExamples(task)}
        `;
      },
      signalPracticeDescription:
        "Press the matching response key. On change trials, when the circle turns blue, use the matching response key on the right side."
    }
  };
});