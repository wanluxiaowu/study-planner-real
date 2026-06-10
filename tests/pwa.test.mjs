import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("html exposes installable pwa metadata", async () => {
  const html = await readFile(path.join(root, "public", "index.html"), "utf8");
  const app = await readFile(path.join(root, "public", "app.js"), "utf8");

  assert.match(html, /rel="manifest"/);
  assert.match(html, /theme-color/);
  assert.match(app, /navigator\.serviceWorker\.register/);
});

test("web manifest identifies the study planner app", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "public", "manifest.webmanifest"), "utf8"));

  assert.equal(manifest.name, "双人学习计划");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.src === "/study-room.png"));
});

test("service worker caches static assets but leaves api requests network-only", async () => {
  const worker = await readFile(path.join(root, "public", "service-worker.js"), "utf8");

  assert.match(worker, /study-room\.png/);
  assert.match(worker, /\/app\.js/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /return fetch\(request\)/);
});
