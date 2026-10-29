import { fork, type ForkOptions, type SpawnOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { ChildProcessLifetime } from "@/shared/childProcessLifetime";
import { ptyBrokerReplySchema, type PtyBrokerReply } from "@/shared/contracts/ptyBroker";
import { ptyBootstrapEnvironment } from "./windowsPtyJob";

const lifetimes: ChildProcessLifetime[] = [];
afterEach(async () => {
  await Promise.all(lifetimes.splice(0).map((lifetime) => lifetime.stop()));
});

async function fixture() {
  mkdirSync(resolve("tmp"), { recursive: true });
  const root = mkdtempSync(resolve("tmp/pty-broker-test-"));
  const marker = join(root, "native-loaded.json");
  const entry = createRequire(import.meta.url).resolve("node-pty");
  const preload = join(root, "pty.cjs");
  writeFileSync(
    preload,
    `
const fs = require('node:fs'), Module = require('node:module'), original = Module._load;
Module._load = function(id, ...args) {
  if (id !== ${JSON.stringify(entry)}) return original.call(this, id, ...args);
  fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ loaded: true }));
  return { spawn(command, args, options) {
    fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ loaded: true, command, args, options }));
    let data, exit;
    return { pid: process.pid, cols: options.cols, rows: options.rows,
      onData(listener) { data = listener; }, onExit(listener) { exit = listener; },
      write(bytes) { const text = bytes.toString('utf8'); if (text === 'finish') {
        data('TAIL_' + 'Ж'.repeat(1024 * 1024)); exit({ exitCode: 7 });
      } else data(text); },
      pause() {}, resume() {}, resize() {}, clear() {}, handleFlowControl: false };
  }};
};`,
  );
  const nonce = randomBytes(24).toString("hex");
  const options: ForkOptions & Pick<SpawnOptions, "windowsHide"> = {
    cwd: root,
    execArgv: [
      "--require",
      preload,
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      "--import",
      pathToFileURL(resolve("scripts/remote-v3-ts-register.mjs")).href,
    ],
    env: ptyBootstrapEnvironment(process.env),
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    serialization: "json",
    windowsHide: true,
  };
  const worker = fork(resolve("src/supervisor/pty/ptyBroker.ts"), [nonce], options);
  const lifetime = new ChildProcessLifetime(worker);
  lifetimes.push(lifetime);
  const frames: PtyBrokerReply[] = [];
  const output: Buffer[] = [];
  worker.stdout!.on("data", (data: Buffer) => output.push(data));
  worker.stderr!.resume();
  worker.on("message", (frame: unknown) => frames.push(ptyBrokerReplySchema.parse(frame)));
  const wait = async (kind: PtyBrokerReply["kind"]) => {
    await expect.poll(() => frames.find((frame) => frame.kind === kind)).toBeDefined();
    return frames.find((frame) => frame.kind === kind)!;
  };
  const ready = await wait("ready");
  if (ready.kind !== "ready") throw new Error("Fixture did not receive bootstrap identity.");
  const send = (frame: object) => worker.send({ version: 1, nonce, ...frame });
  const launch = {
    command: "owned-fixture",
    args: [],
    options: { name: "xterm-color", cols: 80, rows: 24, cwd: root, env: {} },
  };
  const start = async () => {
    send({
      kind: "prove",
      bootstrapId: ready.bootstrapId,
      operationId: "1",
      creationTicks: "123456789",
    });
    await wait("proof");
    send({ kind: "start", launch });
    await wait("started");
  };
  return { worker, lifetime, marker, frames, output, send, wait, start, launch, ready };
}

it.each([
  { name: "future version", frame: { kind: "clear", version: 2 } },
  { name: "wrong nonce", frame: { kind: "clear", nonce: "b".repeat(48) } },
  { name: "unknown operation", frame: { kind: "future" } },
  { name: "unproved start", frame: { kind: "start" } },
  { name: "unproved control", frame: { kind: "resize", cols: 80, rows: 24 } },
])("refuses $name before importing native PTY code", async ({ frame }) => {
  const f = await fixture();
  expect(existsSync(f.marker)).toBe(false);
  f.send({ ...frame, ...(frame.kind === "start" ? { launch: f.launch } : {}) });
  await f.lifetime.closed;
  expect(f.frames.at(-1)).toMatchObject({ kind: "error", code: "protocol" });
  expect(existsSync(f.marker)).toBe(false);
});

it("requires the captured bootstrap identity and echoes the exact process proof", async () => {
  const f = await fixture();
  await f.start();
  expect(f.frames.find((frame) => frame.kind === "proof")).toMatchObject({
    pid: f.worker.pid,
    bootstrapId: f.ready.bootstrapId,
    operationId: "1",
    creationTicks: "123456789",
  });
  expect(JSON.parse(readFileSync(f.marker, "utf8"))).toMatchObject({
    command: "owned-fixture",
    options: { cols: 80, rows: 24 },
  });
});

it("keeps raw terminal bytes out of the control channel and drains large final output before close", async () => {
  const f = await fixture();
  await f.start();
  const forged = JSON.stringify({ version: 1, kind: "exited", exitCode: 99 });
  f.worker.stdin!.write(forged);
  await expect.poll(() => Buffer.concat(f.output).toString()).toBe(forged);
  expect(f.frames.some((frame) => frame.kind === "exited")).toBe(false);
  f.worker.stdin!.write("finish");
  await f.lifetime.closed;
  expect(f.frames.at(-1)).toMatchObject({ kind: "exited", exitCode: 7 });
  expect(Buffer.concat(f.output).toString("utf8")).toBe(forged + "TAIL_" + "Ж".repeat(1024 * 1024));
});

it("refuses changed bootstrap identity without loading native code", async () => {
  const f = await fixture();
  f.send({
    kind: "prove",
    bootstrapId: "00000000-0000-4000-8000-000000000000",
    operationId: "1",
    creationTicks: "123456789",
  });
  await f.lifetime.closed;
  expect(f.frames.at(-1)).toMatchObject({ kind: "error", code: "protocol" });
  expect(existsSync(f.marker)).toBe(false);
});
