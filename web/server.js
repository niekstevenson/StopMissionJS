const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const WEB_ROOT = __dirname;
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const DESIGNS_ROOT = path.join(REPO_ROOT, "tasks", "designs");
const SHARED_ROOT = path.join(REPO_ROOT, "shared");
const NODE_MODULES_ROOT = path.join(REPO_ROOT, "node_modules");
const DATA_ROOT = path.join(WEB_ROOT, "data");
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const DATA_COLUMNS = [
  "task",
  "subject",
  "trial",
  "block",
  "stimulus_type",
  "stimulus_orientation",
  "stimulus_fill",
  "ssd_ms",
  "ssd_actual_ms",
  "rt_ms",
  "response"
];

const KEYMAP_COLUMNS = [
  "task",
  "subject",
  "session_id",
  "left_shift_code",
  "left_shift_key",
  "left_shift_label",
  "left_inner_code",
  "left_inner_key",
  "left_inner_label",
  "right_inner_code",
  "right_inner_key",
  "right_inner_label",
  "right_shift_code",
  "right_shift_key",
  "right_shift_label"
];

function safeJoin(root, relativePath) {
  const resolvedPath = path.resolve(root, relativePath);
  return resolvedPath.startsWith(root + path.sep) || resolvedPath === root ? resolvedPath : null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function serveFile(response, absolutePath) {
  fs.stat(absolutePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    const contentType = MIME_TYPES[path.extname(absolutePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(absolutePath).pipe(response);
  });
}

function resolveStaticPath(pathname) {
  if (pathname === "/") {
    return path.join(WEB_ROOT, "index.html");
  }

  if (pathname.startsWith("/js/") || pathname === "/styles.css") {
    return safeJoin(WEB_ROOT, pathname.slice(1));
  }

  if (pathname.startsWith("/shared/")) {
    return safeJoin(SHARED_ROOT, pathname.slice("/shared/".length));
  }

  if (pathname.startsWith("/designs/")) {
    return safeJoin(DESIGNS_ROOT, pathname.slice("/designs/".length));
  }

  if (pathname.startsWith("/node_modules/")) {
    return safeJoin(NODE_MODULES_ROOT, pathname.slice("/node_modules/".length));
  }

  return null;
}

function sanitizeToken(value, fallback) {
  const sanitized = String(value ?? fallback).replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized || fallback;
}

function csvEscape(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function appendCsvRecord(filePath, record, columns = DATA_COLUMNS) {
  const exists = fs.existsSync(filePath);
  const row = columns.map((column) => csvEscape(record[column])).join(",");
  const lines = exists ? `${row}\n` : `${columns.join(",")}\n${row}\n`;

  fs.appendFileSync(filePath, lines, "utf8");
}

function writeCsvRecord(filePath, record, columns) {
  const row = columns.map((column) => csvEscape(record[column])).join(",");
  fs.writeFileSync(filePath, `${columns.join(",")}\n${row}\n`, "utf8");
}

function handleDataPost(request, response) {
  let body = "";

  request.on("data", (chunk) => {
    body += chunk;
  });

  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const task = sanitizeToken(payload.task, "unknown");
      const subject = sanitizeToken(payload.subject, "unknown");
      const sessionId = sanitizeToken(payload.session_id, "no-session");
      const subjectDirectory = `subject_${String(subject).padStart(3, "0")}`;
      const filePath = path.join(DATA_ROOT, task, subjectDirectory, `${sessionId}.csv`);
      const record = {
        ...payload,
        received_at: new Date().toISOString()
      };

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      appendCsvRecord(filePath, record);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });
}

function handleKeymapPost(request, response) {
  let body = "";

  request.on("data", (chunk) => {
    body += chunk;
  });

  request.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const task = sanitizeToken(payload.task, "unknown");
      const subject = sanitizeToken(payload.subject, "unknown");
      const sessionId = sanitizeToken(payload.session_id, "no-session");
      const subjectDirectory = `subject_${String(subject).padStart(3, "0")}`;
      const filePath = path.join(DATA_ROOT, task, subjectDirectory, `keymap_${sessionId}.csv`);

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      writeCsvRecord(filePath, payload, KEYMAP_COLUMNS);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/data") {
    handleDataPost(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/keymap") {
    handleKeymapPost(request, response);
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const staticPath = resolveStaticPath(url.pathname);

  if (!staticPath) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  serveFile(response, staticPath);
});

server.listen(PORT, () => {
  console.log(`Stop Mission JS server listening on http://localhost:${PORT}`);
});
