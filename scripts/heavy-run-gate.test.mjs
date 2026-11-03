import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acquire, gateBypassReason, release, resolveSlots, tryAcquire } from "./heavy-run-gate.mjs";

const gate = fileURLToPath(new URL("./heavy-run-gate.mjs", import.meta.url));
const owner = (pid = process.pid) => ({ pid, cwd: "x", command: "y" });
const tempRoot = (t) => {
  const root = fs.mkdtempSync(join(os.tmpdir(), "heavy-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

await test("slots are bounded and released slots are reusable", (t) => {
  const root = tempRoot(t);
  const first = tryAcquire(root, 2, owner());
  const second = tryAcquire(root, 2, owner());
  assert.equal(first.peers, 1);
  assert.equal(second.peers, 2);
  assert.equal(tryAcquire(root, 2, owner()).dir, undefined);
  release(first);
  assert.ok(tryAcquire(root, 2, owner()).dir);
});

await test("a slot owned by a dead pid is reclaimed", (t) => {
  const root = tempRoot(t);
  const deadPid = 2 ** 22 + 12345;
  const dead = tryAcquire(root, 1, owner(deadPid));
  assert.ok(dead.dir);
  assert.ok(tryAcquire(root, 1, owner()).dir);
});

await test("a slot owned by a live pid is never reclaimed", (t) => {
  const root = tempRoot(t);
  assert.ok(tryAcquire(root, 1, owner()).dir);
  const blocked = tryAcquire(root, 1, owner());
  assert.equal(blocked.dir, undefined);
  assert.equal(blocked.holders[0].pid, process.pid);
});

await test("acquire waits for a release", async (t) => {
  const root = tempRoot(t);
  const held = tryAcquire(root, 1, owner());
  setTimeout(() => release(held), 700);
  const logs = [];
  const started = Date.now();
  const slot = await acquire(root, 1, owner(), { log: (line) => logs.push(line) });
  assert.ok(slot.dir);
  assert.ok(Date.now() - started >= 500);
  assert.ok(logs.some((line) => line.includes("waiting")));
});

await test("bypass rules and slot parsing", () => {
  assert.equal(gateBypassReason({ CI: "1" }), "CI");
  assert.equal(gateBypassReason({ PORACODE_HEAVY_GATE_DISABLE: "1" }), "disabled");
  assert.equal(
    gateBypassReason({ PORACODE_HEAVY_GATE_HELD: String(process.pid) }),
    "held by parent",
  );
  assert.equal(gateBypassReason({ PORACODE_HEAVY_GATE_HELD: "999999999" }), null);
  assert.equal(resolveSlots({}), 2);
  assert.equal(resolveSlots({ PORACODE_HEAVY_GATE_SLOTS: "3" }), 3);
  assert.equal(resolveSlots({ PORACODE_HEAVY_GATE_SLOTS: "0" }), 2);
});

const runCli = (args, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [gate, "--", ...args], {
      env: { ...process.env, CI: "", PORACODE_HEAVY_GATE_DISABLE: "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
  });

await test("CLI propagates the exit code and tells the child about its peers", async () => {
  const probe =
    "process.stdout.write(process.env.PORACODE_HEAVY_GATE_PEERS ?? 'none'); process.exit(7)";
  const result = await runCli([process.execPath, "-e", probe], {});
  assert.equal(result.code, 7);
  assert.ok(Number(result.stdout) >= 1);
});

await test("CLI runs a nested gated command directly under a live holder", async () => {
  const probe = "process.stdout.write(process.env.PORACODE_HEAVY_GATE_PEERS || 'none')";
  const result = await runCli([process.execPath, "-e", probe], {
    PORACODE_HEAVY_GATE_HELD: String(process.pid),
    PORACODE_HEAVY_GATE_PEERS: "",
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "none");
});
