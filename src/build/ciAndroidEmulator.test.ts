import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const runner = resolve(import.meta.dirname, "../../scripts/ci-android-emulator.mjs");
const temporaryRoots: string[] = [];

async function fixture(exitCode: number, earlyExit = false) {
  const root = await mkdtemp(join(tmpdir(), "poracode-android-ci-"));
  temporaryRoots.push(root);
  const sdk = join(root, "sdk");
  await mkdir(join(sdk, "emulator"), { recursive: true });
  await mkdir(join(sdk, "platform-tools"), { recursive: true });
  const prelude = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.RUNNER_TEMP;
`;
  await writeFile(
    join(sdk, "emulator", "emulator"),
    `${prelude}
fs.writeFileSync(path.join(root, "emulator-pid"), String(process.pid));
if (${earlyExit}) process.exit(7);
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  await writeFile(
    join(sdk, "platform-tools", "adb"),
    `${prelude}
const command = process.argv.slice(2).join(" ");
const counterPath = path.join(root, "input-polls");
const polls = fs.existsSync(counterPath) ? Number(fs.readFileSync(counterPath, "utf8")) : 0;
if (command.endsWith("getprop sys.boot_completed")) console.log("1");
if (command.endsWith("service check input")) {
  fs.writeFileSync(counterPath, String(polls + 1));
  console.log(polls === 0 ? "Service input: not found" : "Service input: found");
}
if (command.endsWith("input keyevent 82")) {
  if (polls < 2) { console.error("cmd: Can't find service: input"); process.exit(20); }
  fs.writeFileSync(path.join(root, "unlocked"), "yes");
}
if (command.includes("logcat")) console.log("fixture logcat");
`,
    { mode: 0o755 },
  );
  const suite = join(root, "suite.cjs");
  await writeFile(
    suite,
    `${prelude}
if (!fs.existsSync(path.join(root, "unlocked"))) process.exit(21);
fs.appendFileSync(path.join(root, "runs"), JSON.stringify({ args: process.argv.slice(2), serial: process.env.ANDROID_SERIAL }) + "\\n");
process.exit(${exitCode});
`,
  );
  const run = () =>
    execute(process.execPath, [runner, "fixture-avd", process.execPath, suite, "one argument"], {
      env: { ...process.env, ANDROID_HOME: sdk, RUNNER_TEMP: root },
      timeout: 10_000,
    });
  return { root, run };
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("Android CI emulator startup", () => {
  it.each([
    { exitCode: 0, runnerExitCode: 0, stderr: "" },
    { exitCode: 42, runnerExitCode: 1, stderr: expect.stringContaining("exited with 42") },
  ])(
    "waits for input, runs the suite once, and preserves exit code $exitCode",
    async ({ exitCode, runnerExitCode, stderr }) => {
      const { root, run } = await fixture(exitCode);
      const result = await run().then(
        (output) => ({ code: 0, stderr: output.stderr }),
        (error: { code: number; stderr: string }) => error,
      );
      expect(result).toMatchObject({ code: runnerExitCode, stderr });
      const runs = (await readFile(join(root, "runs"), "utf8")).trim().split("\n");
      expect(runs).toHaveLength(1);
      expect(JSON.parse(runs[0]!)).toEqual({ args: ["one argument"], serial: "emulator-5554" });
      expect(await readFile(join(root, "android-emulator-logcat.txt"), "utf8")).toBe(
        "fixture logcat",
      );
      const pid = Number(await readFile(join(root, "emulator-pid"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow("ESRCH");
    },
  );

  it("fails before running the suite if the emulator exits", async () => {
    const { root, run } = await fixture(0, true);
    await expect(run()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("exited with 7"),
    });
    await expect(readFile(join(root, "runs"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
