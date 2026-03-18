import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../server.js";

let server;
let baseUrl;
let logFile;

before(async () => {
  logFile = path.join(process.cwd(), "test", "tmp-server.log");
  fs.writeFileSync(logFile, "");
  process.env.LOG_FILE = logFile;
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

test("health endpoint returns ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("index.html is served", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<!doctype html>/i);
  assert.match(body, /Broadcast-Ready Audio Batch Mastering/i);
});

test("requests are logged", async () => {
  await fetch(`${baseUrl}/health`);
  const log = fs.readFileSync(logFile, "utf8");
  assert.ok(log.includes('"url":"/health"'));
  assert.ok(log.includes('"status":200'));
});

test("client logs are accepted", async () => {
  const res = await fetch(`${baseUrl}/client-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "error", message: "test log" }),
  });
  assert.equal(res.status, 200);
});

test("process endpoint requires files", async () => {
  const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
  const form = new FormData();
  const res = await fetch(`${baseUrl}/process`, { method: "POST", body: form });
  if (health.ffmpeg === false) {
    assert.equal(res.status, 503);
  } else {
    assert.equal(res.status, 400);
  }
  const body = await res.json();
  assert.equal(body.ok, false);
});
