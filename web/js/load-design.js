(function attachDesignLoader(global) {
  function padSubjectId(subject) {
    return String(subject).padStart(3, "0");
  }

  function parseValue(rawValue) {
    const trimmed = rawValue.trim();
    const numeric = Number(trimmed);
    return trimmed !== "" && Number.isFinite(numeric) ? numeric : trimmed;
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const nextCharacter = line[index + 1];

      if (character === "\"" && inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
      } else if (character === "\"") {
        inQuotes = !inQuotes;
      } else if (character === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    values.push(current);
    return values;
  }

  function parseCsv(csvText) {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());

    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const row = {};

      headers.forEach((header, index) => {
        row[header] = parseValue(values[index] ?? "");
      });

      return row;
    });
  }

  async function loadDesign(task, subject) {
    const response = await fetch(`/designs/${encodeURIComponent(task)}/subject_${padSubjectId(subject)}.csv`);

    if (!response.ok) {
      throw new Error(`Failed to load design for task "${task}" subject "${subject}".`);
    }

    return parseCsv(await response.text());
  }

  global.stopMissionLoadDesign = loadDesign;
})(window);
