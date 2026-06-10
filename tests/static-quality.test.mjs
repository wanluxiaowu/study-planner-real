import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("main page keeps visual and responsive design guardrails", async () => {
  const html = await readFile(path.join(root, "public", "index.html"), "utf8");

  assert.match(html, /study-room\.png/);
  assert.match(html, /@media \(max-width: 1050px\)/);
  assert.match(html, /@media \(max-width: 700px\)/);
  assert.match(html, /letter-spacing:\s*0/);
  assert.doesNotMatch(html, /clamp\(/);
  assert.doesNotMatch(html, /font-size:[^;]*vw/);
});

test("public handoff is centered on a one-click anyone-can-use launcher", async () => {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const launcher = await readFile(path.join(root, "start-anyone-can-use.cmd"), "utf8");
  const publicLauncher = await readFile(path.join(root, "start-anyone-can-use.ps1"), "utf8");

  assert.match(readme, /start-anyone-can-use\.cmd/);
  assert.match(readme, /https:\/\/xxxxx\.trycloudflare\.com/);
  assert.match(readme, /\u4efb\u4f55\u4eba/);
  assert.match(launcher, /start-anyone-can-use\.ps1/);
  assert.match(launcher, /chcp 65001/);
  assert.match(publicLauncher, /cloudflared/);
  assert.match(publicLauncher, /trycloudflare\.com/);
  assert.match(publicLauncher, /Set-Clipboard/);
  assert.doesNotMatch(launcher, /start "" "http:\/\/127\.0\.0\.1:4173"/);
});

test("anyone-can-use launcher skips occupied unhealthy ports", async () => {
  const publicLauncher = await readFile(path.join(root, "start-anyone-can-use.ps1"), "utf8");

  assert.match(publicLauncher, /function Test-StudyPlannerHealth/);
  assert.match(publicLauncher, /function Find-FreePort/);
  assert.match(publicLauncher, /\$LocalPort\s*=/);
  assert.match(publicLauncher, /\$env:PORT='\$LocalPort'/);
  assert.match(publicLauncher, /http:\/\/127\.0\.0\.1:\$LocalPort\/api\/health/);
  assert.match(publicLauncher, /http:\/\/127\.0\.0\.1:\$LocalPort/);
  assert.doesNotMatch(publicLauncher, /Invoke-RestMethod -Uri "http:\/\/127\.0\.0\.1:4173\/api\/health"/);
  assert.doesNotMatch(publicLauncher, /--url", "http:\/\/127\.0\.0\.1:4173"/);
});

test("anyone-can-use launcher opens the public url only after it is reachable", async () => {
  const publicLauncher = await readFile(path.join(root, "start-anyone-can-use.ps1"), "utf8");

  assert.match(publicLauncher, /function Wait-ForPublicHealth/);
  assert.match(publicLauncher, /\/api\/health/);
  assert.match(publicLauncher, /Waiting for the public URL to become reachable/);
  assert.match(publicLauncher, /\$publicReady = Wait-ForPublicHealth/);
  assert.match(publicLauncher, /This temporary Cloudflare URL was created but is not reachable yet/);
  assert.match(publicLauncher, /Set-Clipboard -Value \$publicUrl/);
  assert.match(publicLauncher, /Start-Process \$publicUrl/);
});

test("old static entry clearly redirects users to the real shared version", async () => {
  const html = await readFile(path.resolve(root, "..", "study-planner-site", "index.html"), "utf8");

  assert.match(html, /\u65e7\u9759\u6001\u9884\u89c8\u5df2\u505c\u7528/);
  assert.match(html, /start-anyone-can-use\.cmd/);
  assert.doesNotMatch(html, /clamp\(/);
  assert.doesNotMatch(html, /font-size:[^;]*vw/);
});
