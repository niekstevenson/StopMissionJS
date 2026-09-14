(function registerStimulusSelective(root, factory) {
  const task = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = task;
    return;
  }

  root.stopTaskSpecs = root.stopTaskSpecs || [];
  root.stopTaskSpecs.push(task);
})(typeof globalThis !== "undefined" ? globalThis : this, function buildStimulusSelective() {
  return {
    id: "stimulus_selective",
    title: "Stimulus selective stop signal",
    orientationResponseKeys: ["left_shift", "left_inner"],
    responseKeys: ["left_shift", "left_inner"],
    stopRules: [
      {
        id: "withhold",
        signal: "red",
        weight: 1,
        outcome: "withhold",
        requiresSignalForSuccess: false
      },
      {
        id: "ignore",
        signal: "blue",
        weight: 1,
        outcome: "orientation_key",
        requiresSignalForSuccess: false
      }
    ],
    instructions: {
      timingDifficulty: "The circle changes color after the symbol appears, so on a stop trial it may sometimes be difficult to stop yourself from responding in time.",
      signalIntro: `
        <p>We will now introduce an extra thing to look out for.</p>
        <p>On some trials, the circle around the symbol turns either red or blue shortly after the symbol appears.</p>
        <p>Trials where the circle turns red are stop trials. On stop trials, try to stop yourself from pressing a key.</p> 
        <p> Trials where the circle turns blue are ignore trials. On ignore trials, ignore the blue circle and respond to the symbol on screen as usual.</p>
        <p>That is, when the circle is is black or blue, respond as usual. But when the circle turns red, do not press any key.</p>
      `,
      signalRule(task, helpers) {
        return `
          <p>On a stop trial, when the circle turns red, do not press any response key.</p>
          <p>On an ignore trial, when the circle turns blue, ignore the blue circle and respond to the symbol on screen.</p>
            ${helpers.renderStimulusActionRows(task, [
            { orientations: ["normal", "rotated"], signal: "red", responseText: "Do not press any key" },
            { orientation: "normal", signal: "blue", key: task.orientationKeys.normal },
            { orientation: "rotated", signal: "blue", key: task.orientationKeys.rotated }
          ])}
        `;
      },
      signalPracticeDescription:
        "Press the matching picture key. On stop trials, when the circle turns red, try not to press any response key. On ignore trials, when the circle turns blue, ignore the blue circle and respond to the symbol on screen."
    }
  };
});
