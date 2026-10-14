/**
 * Test-only process/adb helpers for the B1 CAPABLE-HOST Android device journey.
 *
 * Owns the forked crash-seed/verify fixtures and the adb command surface. The
 * journey orchestration stays in `androidCapableHistoryJourney.ts`; nothing
 * here is production code.
 */

import { fork, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CAPABLE_HISTORY_SEED_ARMED_MARKER,
  CAPABLE_HISTORY_VERIFY_MARKER,
  type CapableHistorySeedParams,
  type CapableHistoryVerifyResult,
} from "./androidCapableHistorySeed.ts";
import { capableHistoryJourneyError } from "./androidCapableHistoryHost.ts";
import { detectServerNativeBinding } from "../harness/paths.ts";

// ── Seed / verify child processes ───────────────────────────────────────────

type FixtureMode = "seed" | "verify";

function fixtureForkEnv(repoRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const binding = detectServerNativeBinding(repoRoot);
  if (binding) env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = binding;
  return env;
}

function launchFixtureChild(input: {
  readonly repoRoot: string;
  readonly mode: FixtureMode;
  readonly fixturePath: string;
  readonly dbPath: string;
  readonly params: CapableHistorySeedParams;
}): ChildProcess {
  return fork(input.fixturePath, [input.mode, input.dbPath, JSON.stringify(input.params)], {
    execArgv: [
      "--experimental-transform-types",
      "--disable-warning=ExperimentalWarning",
      "--import",
      resolve(input.repoRoot, "scripts/remote-v3-ts-register.mjs"),
    ],
    env: fixtureForkEnv(input.repoRoot),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

async function waitForFixtureOutput(
  child: ChildProcess,
  needle: string,
  timeoutMs = 60_000,
): Promise<string> {
  let output = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const deadline = Date.now() + timeoutMs;
  while (!output.includes(needle)) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw capableHistoryJourneyError(
        "fixture-exited-early",
        `fixture exited before ${needle}: ${output}${stderr}`,
      );
    }
    if (Date.now() > deadline) {
      throw capableHistoryJourneyError("fixture-timeout", `${needle}: ${output}${stderr}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  return output;
}

/**
 * `once(child, "exit")` never resolves for an exit that already happened, so
 * check the recorded state first; a fast fixture can exit between the marker
 * read and the listener attachment.
 */
async function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await once(child, "exit");
}

/** Same already-finished guard as {@link waitForChildExit}, for stdio close. */
export async function waitForChildClose(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return await new Promise<number | null>((resolveWait) => {
    child.once("close", (code) => resolveWait(code));
    // A failed spawn emits `error` and may never emit `close`; resolving here
    // lets the caller join its owned cleanup instead of leaving the event
    // unhandled (or waiting forever for a process that never existed).
    child.once("error", () => resolveWait(null));
  });
}

/**
 * Seeds the crash evidence and SIGKILLs the seeder at the marker: the accepted
 * event queued after the flush is lost while the touch survives. Returns the
 * seeder's stdout (the exact accepted prefix ids plus the lost id).
 */
export async function runCapableHistorySeedFixture(input: {
  readonly repoRoot: string;
  readonly fixturePath: string;
  readonly dbPath: string;
  readonly params: CapableHistorySeedParams;
  readonly timeoutMs?: number;
}): Promise<string> {
  const child = launchFixtureChild({ ...input, mode: "seed" });
  try {
    const output = await waitForFixtureOutput(
      child,
      CAPABLE_HISTORY_SEED_ARMED_MARKER,
      input.timeoutMs ?? 60_000,
    );
    child.kill("SIGKILL");
    await waitForChildExit(child);
    return output;
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

/** Read-only reopen: proves the durable evidence without disarming it. */
export async function runCapableHistoryVerifyFixture(input: {
  readonly repoRoot: string;
  readonly fixturePath: string;
  readonly dbPath: string;
  readonly params: CapableHistorySeedParams;
  readonly timeoutMs?: number;
}): Promise<CapableHistoryVerifyResult> {
  const child = launchFixtureChild({ ...input, mode: "verify" });
  const output = await waitForFixtureOutput(
    child,
    CAPABLE_HISTORY_VERIFY_MARKER,
    input.timeoutMs ?? 60_000,
  );
  await waitForChildExit(child);
  const code = child.exitCode;
  if (code !== 0) {
    throw capableHistoryJourneyError("verify-exit", `verify fixture exited ${String(code)}`);
  }
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(`${CAPABLE_HISTORY_VERIFY_MARKER} `));
  if (!line) throw capableHistoryJourneyError("verify-output-missing", output);
  return JSON.parse(
    line.slice(CAPABLE_HISTORY_VERIFY_MARKER.length + 1),
  ) as CapableHistoryVerifyResult;
}

// ── adb helpers ─────────────────────────────────────────────────────────────

export interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The adb surface the journey needs; structurally satisfied by its inputs. */
export interface CapableHistoryAdbTarget {
  readonly adbPath: string;
  readonly serial: string | null;
}

export function adbArgs(target: CapableHistoryAdbTarget, args: readonly string[]): string[] {
  return [...(target.serial ? ["-s", target.serial] : []), ...args];
}

/**
 * Quotes one literal argument for the REMOTE `adb shell` command line.
 *
 * adb concatenates its argv into a single string that the device shell
 * re-parses, so every value that crosses `adb shell` must be a complete POSIX
 * literal word, not a partially escaped token. Wrapping in `'…'` neutralizes
 * spaces, quotes, glob metacharacters (`[ ] * ? { }`), `$`, backticks, `;`,
 * `&`, `|`, `#`, newlines, and every other metacharacter in one rule, and an
 * embedded single quote becomes the standard `'\''` sequence. The previous
 * glob-only backslash escaping left spaces/quotes/`$` interpreted by the
 * remote shell (`[chj-t1-done]` expanded to `d`), which silently weakened the
 * device-side marker wait.
 */
export function adbShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) =>
      resolveCommand({ code: -1, stdout, stderr: `${stderr}${String(error)}` }),
    );
    child.once("close", (code) => resolveCommand({ code, stdout, stderr }));
  });
}

export async function runAdb(
  target: CapableHistoryAdbTarget,
  args: readonly string[],
): Promise<CommandResult> {
  const result = await runCommand(target.adbPath, adbArgs(target, args));
  if (result.code !== 0) {
    throw capableHistoryJourneyError(
      "adb-failed",
      `adb ${args.join(" ")} exited ${String(result.code)}: ${result.stderr.trim()}`,
    );
  }
  return result;
}

export function redact(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length >= 8) redacted = redacted.split(secret).join("REDACTED");
  }
  return redacted;
}

// ── Canonical app under test ────────────────────────────────────────────────

/**
 * The canonical app under test comes from the Android build itself, never from
 * an operator-supplied id: an arbitrary `..._APP_ID` override must not be able
 * to point the destructive `pm clear` at an unrelated installed package.
 */
export function readCanonicalAndroidAppId(repoRoot: string): string {
  const gradlePath = join(repoRoot, "android/app/build.gradle.kts");
  let gradle: string;
  try {
    gradle = readFileSync(gradlePath, "utf8");
  } catch {
    throw capableHistoryJourneyError("canonical-app-id-unreadable", gradlePath);
  }
  const match = /\bapplicationId\s*=\s*"([^"]+)"/.exec(gradle);
  const appId = match?.[1];
  if (!appId) {
    throw capableHistoryJourneyError(
      "canonical-app-id-unreadable",
      `no applicationId declaration in ${gradlePath}`,
    );
  }
  return appId;
}

// ── Device ownership (read-only identity + fail-closed assertion) ───────────

export interface CapableHistoryInstrumentationEntry {
  readonly component: string;
  readonly targetPackage: string;
}

/** `pm list instrumentation` lines with their `(target=…)` package. */
export function parseCapableHistoryInstrumentationList(
  output: string,
): CapableHistoryInstrumentationEntry[] {
  const entries: CapableHistoryInstrumentationEntry[] = [];
  for (const rawLine of output.split("\n")) {
    const match = /^instrumentation:(\S+)\s+\(target=([^)]+)\)/.exec(rawLine.trim());
    const component = match?.[1];
    const targetPackage = match?.[2];
    if (component && targetPackage) entries.push({ component, targetPackage });
  }
  return entries;
}

export interface CapableHistoryDeviceIdentity {
  readonly serial: string;
  readonly qemuKernel: string;
  readonly buildCharacteristics: string;
  readonly isEmulator: boolean;
  readonly avdName: string | null;
  readonly model: string;
  readonly apiLevel: string;
  readonly abi: string;
  readonly buildFingerprint: string;
  readonly appId: string;
  readonly testPackage: string;
  readonly appPath: string;
  readonly instrumentationPath: string;
  readonly instrumentation: readonly CapableHistoryInstrumentationEntry[];
}

/**
 * Read-only device fingerprint. Nothing here mutates the device: the caller
 * must assert ownership from this identity before `adb reverse`/`pm clear`.
 * The serial is explicit — adb default selection (which may be the operator's
 * personal phone) is never used.
 */
export async function readCapableHistoryDeviceIdentity(input: {
  readonly target: CapableHistoryAdbTarget;
  readonly appId: string;
}): Promise<CapableHistoryDeviceIdentity> {
  const serial = input.target.serial?.trim();
  if (!serial) {
    throw capableHistoryJourneyError(
      "serial-required",
      "set ANDROID_CAPABLE_HISTORY_JOURNEY_SERIAL to the dedicated emulator serial; adb default selection is refused",
    );
  }
  const adb = (args: readonly string[]) =>
    runCommand(input.target.adbPath, adbArgs(input.target, args));
  const readProp = async (name: string): Promise<string> =>
    (await adb(["shell", "getprop", name])).stdout.trim();
  const [qemuKernel, buildCharacteristics, model, apiLevel, abi, buildFingerprint] =
    await Promise.all([
      readProp("ro.kernel.qemu"),
      readProp("ro.build.characteristics"),
      readProp("ro.product.model"),
      readProp("ro.build.version.sdk"),
      readProp("ro.product.cpu.abi"),
      readProp("ro.build.fingerprint"),
    ]);
  const avdResult = await adb(["emu", "avd", "name"]);
  const avdName =
    avdResult.code === 0
      ? (avdResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? null)
      : null;
  const testPackage = `${input.appId}.test`;
  const [instrumentationOutput, appPath, instrumentationPath] = await Promise.all([
    adb(["shell", "pm", "list", "instrumentation"]),
    adb(["shell", "pm", "path", input.appId]),
    adb(["shell", "pm", "path", testPackage]),
  ]);
  return {
    serial,
    qemuKernel,
    buildCharacteristics,
    isEmulator:
      qemuKernel === "1" &&
      buildCharacteristics
        .split(",")
        .map((entry) => entry.trim())
        .includes("emulator"),
    avdName,
    model,
    apiLevel,
    abi,
    buildFingerprint,
    appId: input.appId,
    testPackage,
    appPath: appPath.stdout.trim(),
    instrumentationPath: instrumentationPath.stdout.trim(),
    instrumentation: parseCapableHistoryInstrumentationList(instrumentationOutput.stdout),
  };
}

/**
 * Fail-closed ownership assertion: the target must be the explicitly named
 * dedicated emulator/AVD and must carry the canonical app under test plus its
 * instrumentation. Any problem throws `device-not-owned`; the caller performs
 * no destructive step (no `adb reverse`, no `pm clear`).
 */
export function assertCapableHistoryDeviceOwnership(input: {
  readonly identity: CapableHistoryDeviceIdentity;
  readonly expectedAvd: string;
  readonly expectedAppId: string;
  readonly runnerComponent: string;
}): void {
  const { identity } = input;
  const problems: string[] = [];
  if (!identity.isEmulator) {
    problems.push(
      `serial ${identity.serial} is not an emulator (ro.kernel.qemu=${identity.qemuKernel || "<unset>"})`,
    );
  }
  if (identity.avdName === null) {
    problems.push(`serial ${identity.serial} has no AVD identity (adb emu avd name failed)`);
  } else if (identity.avdName !== input.expectedAvd) {
    problems.push(`AVD ${identity.avdName} != expected dedicated AVD ${input.expectedAvd}`);
  }
  if (identity.appId !== input.expectedAppId) {
    problems.push(`app id ${identity.appId} != canonical app under test ${input.expectedAppId}`);
  }
  if (identity.appPath.length === 0) {
    problems.push(`app ${identity.appId} is not installed on ${identity.serial}`);
  }
  if (identity.instrumentationPath.length === 0) {
    problems.push(`instrumentation package ${identity.testPackage} is not installed`);
  }
  const runner = identity.instrumentation.find(
    (entry) => entry.component === input.runnerComponent,
  );
  if (!runner) {
    problems.push(`installed instrumentation ${input.runnerComponent} is missing`);
  } else if (runner.targetPackage !== input.expectedAppId) {
    problems.push(
      `instrumentation ${input.runnerComponent} targets ${runner.targetPackage}, not ${input.expectedAppId}`,
    );
  }
  if (problems.length > 0) {
    throw capableHistoryJourneyError("device-not-owned", problems.join("; "));
  }
}

/** `pm clear` reports success on stdout; an empty or failing run must refuse. */
export function capableHistoryClearSucceeded(result: CommandResult): boolean {
  return result.code === 0 && /success/i.test(result.stdout);
}

/** Screenshot files the instrumented journey writes to the app's external dir. */
export const CAPABLE_HISTORY_SCREENSHOT_FILES = [
  "capable-history-paired.png",
  "capable-history-banner.png",
  "capable-history-banner-screen.png",
  "capable-history-after-ack.png",
  "capable-history-after-ack-screen.png",
  "capable-history-live-append.png",
  "capable-history-live-append-screen.png",
  "capable-history-reconnect.png",
  "capable-history-reconnect-screen.png",
] as const;

/**
 * Best-effort device evidence pull. Missing files are recorded, never fatal:
 * the instrumented run may have failed before the first capture.
 */
export async function pullCapableHistoryScreenshots(input: {
  readonly target: CapableHistoryAdbTarget;
  readonly appId: string;
  readonly outDir: string;
}): Promise<{
  readonly directory: string;
  readonly pulled: readonly string[];
  readonly missing: readonly string[];
  readonly hashes: Readonly<Record<string, string>>;
}> {
  const directory = join(input.outDir, "screenshots");
  mkdirSync(directory, { recursive: true });
  const pulled: string[] = [];
  const missing: string[] = [];
  const hashes: Record<string, string> = {};
  for (const name of CAPABLE_HISTORY_SCREENSHOT_FILES) {
    const remote = `/sdcard/Android/data/${input.appId}/files/${name}`;
    const local = join(directory, name);
    const result = await runCommand(input.target.adbPath, [
      ...adbArgs(input.target, []),
      "pull",
      remote,
      local,
    ]);
    if (result.code === 0) {
      pulled.push(name);
      try {
        hashes[name] = createHash("sha256").update(readFileSync(local)).digest("hex");
      } catch {
        // Hash stays absent; the file was still pulled.
      }
    } else {
      missing.push(name);
    }
  }
  return { directory, pulled, missing, hashes };
}
