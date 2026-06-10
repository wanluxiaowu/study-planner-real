import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createStore,
  exportGroupState,
  importGroupState,
  joinGroup,
  loadGroupState,
  normalizeInviteCode,
  saveGroupState,
} from "./server/store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const store = createStore(path.join(root, "data", "store.json"));
const port = Number(globalThis.process?.env?.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return sendJson(response, { ok: true, service: "study-planner-real" });
    }

    if (url.pathname === "/api/join" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, await joinGroup(store, body));
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const inviteCode = normalizeInviteCode(url.searchParams.get("inviteCode"));
      return sendJson(response, await loadGroupState(store, inviteCode));
    }

    if (url.pathname === "/api/state" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, await saveGroupState(store, body.inviteCode, body.state));
    }

    if (url.pathname === "/api/export" && request.method === "GET") {
      const inviteCode = normalizeInviteCode(url.searchParams.get("inviteCode"));
      return sendJson(response, await exportGroupState(store, inviteCode));
    }

    if (url.pathname === "/api/import" && request.method === "POST") {
      const body = await readJson(request);
      return sendJson(response, await importGroupState(store, body));
    }

    const filePath = safePublicPath(url.pathname);
    const file = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(file);
  } catch (error) {
    const status = error.statusCode || (error.code === "ENOENT" ? 404 : 500);
    sendJson(response, { error: error.message }, status);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`双人学习计划已启动: http://127.0.0.1:${port}`);
  for (const address of localAddresses()) {
    console.log(`同一局域网可尝试访问: http://${address}:${port}`);
  }
});

function safePublicPath(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(publicDir, `.${decodeURIComponent(requested)}`);
  if (!resolved.startsWith(publicDir)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}
