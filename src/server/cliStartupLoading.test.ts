import { execFile, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, afterAll, expect, it } from "vitest";
import { buildSyntheticCliEntry } from "./cliTestBundle";
import { ensureDeclaredAssetsDir } from "./testDeclaredAssets";
const execute = promisify(execFile);
let directory: string, entry: string, marker: string;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "poracode-cli-loading-"));
  mkdirSync(join(directory, "lib"));
  mkdirSync(join(directory, "resources", "wsl-helpers"), { recursive: true });
  entry = join(directory, "lib", "server.cjs");
  marker = join(directory, "composition-loaded");
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "poracode", version: "2.0.0-fixture" }),
  );
  writeFileSync(
    join(directory, "probe.cjs"),
    "globalThis.__cliFixture = {create() {throw new Error('Owned composition probe');}, stopDiagnostics() {return Promise.resolve();}};",
  );
  writeFileSync(
    join(directory, "cancel-probe.cjs"),
    `const {writeFileSync} = require('node:fs'); globalThis.__cliFixture = {onImport() {process.emit('SIGINT');}, create() {throw new Error('Cancelled composition must not be constructed');}, stopDiagnostics() {writeFileSync(${JSON.stringify(join(directory, "diagnostics-stopped"))}, 'joined'); return Promise.resolve();}};`,
  );
  writeFileSync(
    join(directory, "cancel-persistence-probe.cjs"),
    `const {writeFileSync} = require('node:fs'); globalThis.__cliFixture = {onPersistenceImport() {process.emit('SIGINT');}, create() {throw new Error('Cancelled persistence must not construct the host');}, stopDiagnostics() {writeFileSync(${JSON.stringify(join(directory, "persistence-diagnostics-stopped"))}, 'joined'); return Promise.resolve();}};`,
  );
  await buildSyntheticCliEntry(entry, marker);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function run(args: string[], preload = "probe.cjs") {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORACODE_BASE_DIR: join(directory, "profile"),
    PORACODE_WSL_HELPERS_DIR: ensureDeclaredAssetsDir(),
    NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
  };
  delete env.NODE_OPTIONS;
  delete env.PORACODE_APP_VERSION;
  return execute(process.execPath, ["--require", join(directory, preload), entry, ...args], {
    env,
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
it.each(
  [
    ["--help"],
    ["--version"],
    ["providers", "--help"],
    ["providers", "custom", "--help"],
    ["run", "--help"],
    ["logs", "--help"],
    ["completion", "--json"],
    ["configure", "--show", "--json"],
  ].map((args) => ({ args })),
)(
  "answers $args without loading the server composition or preparing a host root",
  async ({ args }) => {
    rmSync(marker, { force: true });
    rmSync(marker + ".persistence", { force: true });
    rmSync(marker + ".database", { force: true });
    await run(args);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(marker + ".persistence")).toBe(false);
    expect(existsSync(marker + ".database")).toBe(false);
    expect(existsSync(join(directory, "profile.host-v1"))).toBe(false);
  },
);
it("loads the same composition when serve actually starts and reports a bounded startup failure", async () => {
  rmSync(marker, { force: true });
  await expect(
    run(["serve", "--host", "127.0.0.1", "--port", "0", "--no-open"]),
  ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Owned composition probe") });
  expect(existsSync(marker)).toBe(true);
  expect(existsSync(marker + ".persistence")).toBe(true);
});
it("reads the selected root's local log without evaluating composition or creating authority", async () => {
  rmSync(marker, { force: true });
  const root = join(directory, "logs-profile.host-v1");
  mkdirSync(join(root, "logs"), { recursive: true });
  writeFileSync(join(root, "logs", "server.log"), "older\nBearer fixture-secret\n");
  const result = await run([
    "logs",
    "--base-dir",
    join(directory, "logs-profile"),
    "--lines",
    "1",
    "--json",
  ]);
  expect(JSON.parse(result.stdout)).toEqual({
    formatVersion: 1,
    view: "local-log",
    kind: "line",
    text: "Bearer [redacted]",
  });
  expect(existsSync(marker)).toBe(false);
  expect(readdirSync(root)).toEqual(["logs"]);
});
it("reports a broken NDJSON follower pipe on stderr without a second write or unhandled error", async () => {
  const file = join(directory, "broken-pipe.log");
  writeFileSync(file, "ready\n");
  const child = spawn(process.execPath, [entry, "logs", "--log-file", file, "--follow", "--json"], {
    env: {
      ...process.env,
      NODE_PATH: fileURLToPath(new URL("../../node_modules/", import.meta.url)),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 4000,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.once("data", () => {
    child.stdout.destroy();
    writeFileSync(file, "ready\nafter closing output\n");
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  expect(code).toBe(1);
  expect(stderr).toMatch(/\[poracode\].*(EPIPE|pipe|closed)/iu);
  expect(stderr).not.toContain("Unhandled");
  expect(stderr).not.toContain("node:events");
});
it("handles shutdown during composition loading before acquiring ownership or constructing the host", async () => {
  rmSync(marker, { force: true });
  const result = await run(
    ["serve", "--host", "127.0.0.1", "--port", "0", "--no-open"],
    "cancel-probe.cjs",
  );
  expect(existsSync(marker)).toBe(true);
  expect(existsSync(join(directory, "diagnostics-stopped"))).toBe(true);
  expect(existsSync(join(directory, "profile.host-v1"))).toBe(false);
  expect(result.stderr).not.toContain("Cancelled composition must not be constructed");
});

it("joins shutdown during persistence loading before evaluating composition or acquiring ownership", async () => {
  rmSync(marker, { force: true });
  rmSync(marker + ".persistence", { force: true });
  const result = await run(
    ["serve", "--host", "127.0.0.1", "--port", "0", "--no-open"],
    "cancel-persistence-probe.cjs",
  );
  expect(existsSync(marker + ".persistence")).toBe(true);
  expect(existsSync(marker)).toBe(false);
  expect(existsSync(join(directory, "persistence-diagnostics-stopped"))).toBe(true);
  expect(existsSync(join(directory, "profile.host-v1"))).toBe(false);
  expect(result.stderr).not.toContain("Cancelled persistence must not construct the host");
});
