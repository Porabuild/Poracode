/**
 * Test-only owned-simulator seams for the B1 CAPABLE-HOST iOS device journey.
 *
 * Everything here is read-only or simulator-scoped: the journey may only touch
 * the explicitly named dedicated simulator, and every destructive step
 * (uninstall of the disposable app under test) happens after the ownership
 * assertion. `adb` default selection has an iOS analogue here: no helper ever
 * operates on "the booted simulator" — a UDID is always explicit.
 *
 * Nothing here is production code, and no simulator/device is started by the
 * preparation task; the run-time orchestrator owns `simctl boot`.
 */

import { readFileSync } from "node:fs";
import { runCommand, type CommandResult } from "./androidCapableHistoryProcess.ts";
import { capableHistoryJourneyError } from "./androidCapableHistoryHost.ts";

/**
 * The fixed mock-journey simulator `scripts/native-e2e.mjs` reuses across
 * `native:e2e` runs. The capable journey must own a distinct disposable
 * simulator, so a run pinned to this name is refused.
 */
export const SHARED_MOCK_SIMULATOR_NAME = "Poracode Native E2E";

/** Pinned toolchain device/runtime, mirroring `scripts/native-e2e.mjs`. */
export const PINNED_IOS_SIMULATOR_DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-17";
export const PINNED_IOS_SIMULATOR_RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";

export interface IosSimctlTarget {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

export function defaultIosSimctlTarget(): IosSimctlTarget {
  return { command: "xcrun", prefixArgs: ["simctl"] };
}

export function simctlArgs(target: IosSimctlTarget, args: readonly string[]): string[] {
  return [...target.prefixArgs, ...args];
}

export type IosCommandRunner = (command: string, args: readonly string[]) => Promise<CommandResult>;

const defaultRunner: IosCommandRunner = (command, args) => runCommand(command, args);

export async function runSimctl(
  target: IosSimctlTarget,
  args: readonly string[],
  run: IosCommandRunner = defaultRunner,
): Promise<CommandResult> {
  return run(target.command, simctlArgs(target, args));
}

// ── Simulator identity (read-only) ──────────────────────────────────────────

export interface IosSimulatorIdentity {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable: boolean;
  readonly deviceTypeIdentifier: string;
  readonly runtimeIdentifier: string;
  readonly dataPath: string | null;
  readonly lastBootedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Flattens `xcrun simctl list devices --json` into one identity per device.
 * Unknown or malformed entries are dropped rather than guessed; the caller's
 * UDID lookup is fail-closed.
 */
export function parseIosSimulatorDeviceList(raw: string): IosSimulatorIdentity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw capableHistoryJourneyError(
      "simulator-list-unreadable",
      error instanceof Error ? error.message : String(error),
    );
  }
  const devices = asRecord(asRecord(parsed)?.["devices"]);
  if (!devices) {
    throw capableHistoryJourneyError("simulator-list-unreadable", "no devices dictionary");
  }
  const identities: IosSimulatorIdentity[] = [];
  for (const [runtimeIdentifier, entries] of Object.entries(devices)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const record = asRecord(entry);
      const udid = asString(record?.["udid"]);
      if (!record || !udid) continue;
      identities.push({
        udid,
        name: asString(record["name"]) ?? "",
        state: asString(record["state"]) ?? "",
        isAvailable: record["isAvailable"] === true,
        deviceTypeIdentifier: asString(record["deviceTypeIdentifier"]) ?? "",
        runtimeIdentifier,
        dataPath: asString(record["dataPath"]),
        lastBootedAt: asString(record["lastBootedAt"]),
      });
    }
  }
  return identities;
}

/** Reads the full device list through the explicit simctl target. */
export async function readIosSimulatorIdentities(input: {
  readonly target: IosSimctlTarget;
  readonly run?: IosCommandRunner;
}): Promise<IosSimulatorIdentity[]> {
  const result = await runSimctl(
    input.target,
    ["list", "devices", "--json"],
    input.run ?? defaultRunner,
  );
  if (result.code !== 0) {
    throw capableHistoryJourneyError(
      "simulator-list-failed",
      `simctl list devices exited ${String(result.code)}: ${result.stderr.trim()}`,
    );
  }
  return parseIosSimulatorDeviceList(result.stdout);
}

export async function readIosSimulatorIdentity(input: {
  readonly target: IosSimctlTarget;
  readonly udid: string;
  readonly run?: IosCommandRunner;
}): Promise<IosSimulatorIdentity> {
  const udid = input.udid.trim();
  if (udid.length === 0) {
    throw capableHistoryJourneyError(
      "simulator-udid-required",
      "set IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID to the dedicated disposable simulator",
    );
  }
  const identities = await readIosSimulatorIdentities(input);
  const identity = identities.find((candidate) => candidate.udid === udid);
  if (!identity) {
    throw capableHistoryJourneyError(
      "simulator-not-found",
      `simulator ${udid} is unknown to simctl; create the dedicated device first`,
    );
  }
  return identity;
}

/**
 * Fail-closed ownership assertion: the target must be the explicitly named,
 * available dedicated simulator on the pinned runtime, and must not be the
 * shared mock-journey simulator. Problems are joined into one
 * `device-not-owned` error; the caller performs no device mutation until it
 * passes.
 */
export function assertIosSimulatorOwnership(input: {
  readonly identity: IosSimulatorIdentity;
  readonly expectedName: string;
  readonly expectedRuntime: string;
}): void {
  const { identity } = input;
  const problems: string[] = [];
  if (input.expectedName.trim() === SHARED_MOCK_SIMULATOR_NAME) {
    problems.push(
      `expected name ${SHARED_MOCK_SIMULATOR_NAME} is the shared mock-journey simulator; ` +
        "the capable journey requires its own disposable simulator",
    );
  }
  if (!identity.isAvailable) {
    problems.push(`simulator ${identity.udid} is unavailable (state=${identity.state})`);
  }
  if (identity.name !== input.expectedName) {
    problems.push(
      `simulator ${identity.udid} is named ${JSON.stringify(identity.name)}, expected ${JSON.stringify(input.expectedName)}`,
    );
  }
  if (identity.runtimeIdentifier !== input.expectedRuntime) {
    problems.push(
      `simulator ${identity.udid} runs ${identity.runtimeIdentifier}, expected ${input.expectedRuntime}`,
    );
  }
  if (problems.length > 0) {
    throw capableHistoryJourneyError("device-not-owned", problems.join("; "));
  }
}

// ── Boot (headless simctl only; Simulator.app is never opened) ──────────────

export interface IosSimulatorBootEvidence {
  readonly bootedByRunner: boolean;
  readonly stateBefore: string;
  readonly bootOutput: CommandResult | null;
  readonly bootstatusOutput: CommandResult;
}

export async function ensureIosSimulatorBooted(input: {
  readonly target: IosSimctlTarget;
  readonly identity: IosSimulatorIdentity;
  readonly run?: IosCommandRunner;
}): Promise<IosSimulatorBootEvidence> {
  const run = input.run ?? defaultRunner;
  const { identity } = input;
  if (identity.state !== "Booted" && identity.state !== "Shutdown") {
    throw capableHistoryJourneyError(
      "simulator-state-unusable",
      `simulator ${identity.udid} is in state ${identity.state}`,
    );
  }
  let bootOutput: CommandResult | null = null;
  let bootedByRunner = false;
  if (identity.state !== "Booted") {
    bootOutput = await runSimctl(input.target, ["boot", identity.udid], run);
    if (bootOutput.code !== 0) {
      throw capableHistoryJourneyError(
        "simulator-boot-failed",
        `simctl boot ${identity.udid} exited ${String(bootOutput.code)}: ${bootOutput.stderr.trim()}`,
      );
    }
    bootedByRunner = true;
  }
  const bootstatusOutput = await runSimctl(input.target, ["bootstatus", identity.udid, "-b"], run);
  if (bootstatusOutput.code !== 0) {
    throw capableHistoryJourneyError(
      "simulator-bootstatus-failed",
      `simctl bootstatus ${identity.udid} exited ${String(bootstatusOutput.code)}: ${bootstatusOutput.stderr.trim()}`,
    );
  }
  return {
    bootedByRunner,
    stateBefore: identity.state,
    bootOutput,
    bootstatusOutput,
  };
}

// ── Disposable app profile (owned simulator only) ───────────────────────────

export interface IosInstalledAppState {
  readonly installed: boolean;
  readonly containerPath: string | null;
  readonly result: CommandResult;
}

/**
 * `simctl get_app_container` is exit-code-based: 0 means the app exists, and
 * any non-zero answer means this fresh profile does not have it installed
 * (the run then has nothing to clear and records the absence).
 */
export async function readIosInstalledAppState(input: {
  readonly target: IosSimctlTarget;
  readonly udid: string;
  readonly bundleId: string;
  readonly run?: IosCommandRunner;
}): Promise<IosInstalledAppState> {
  const result = await runSimctl(
    input.target,
    ["get_app_container", input.udid, input.bundleId],
    input.run ?? defaultRunner,
  );
  return {
    installed: result.code === 0,
    containerPath: result.code === 0 ? result.stdout.trim() : null,
    result,
  };
}

export interface IosUninstallEvidence {
  readonly skipped: boolean;
  readonly installedBefore: boolean;
  readonly result: CommandResult | null;
  readonly success: boolean;
}

/**
 * Fresh-pair state for the owned profile: the app under test is removed so the
 * next `test-without-building` installs it clean and the journey always starts
 * on onboarding. Only the exact canonical bundle id is touched.
 */
export async function uninstallIosAppForFreshProfile(input: {
  readonly target: IosSimctlTarget;
  readonly udid: string;
  readonly bundleId: string;
  readonly run?: IosCommandRunner;
}): Promise<IosUninstallEvidence> {
  const run = input.run ?? defaultRunner;
  const before = await readIosInstalledAppState({ ...input, run });
  if (!before.installed) {
    return { skipped: true, installedBefore: false, result: null, success: true };
  }
  const result = await runSimctl(input.target, ["uninstall", input.udid, input.bundleId], run);
  return {
    skipped: false,
    installedBefore: true,
    result,
    success: result.code === 0,
  };
}

// ── Built app identity (the canonical app under test) ───────────────────────

/** Pure XML-plist reader so the identifier gate has no tooling dependency. */
export function parseIosInfoPlistBundleIdentifier(xml: string): string | null {
  const match = /<key>\s*CFBundleIdentifier\s*<\/key>\s*<string>([^<]*)<\/string>/.exec(xml);
  const identifier = match?.[1]?.trim();
  return identifier && identifier.length > 0 ? identifier : null;
}

/**
 * The app under test is whatever `build-for-testing` produced; its identifier
 * is read from the built bundle (source of truth), never from an operator
 * override that could point a simulator uninstall at an unrelated app.
 */
export async function readIosAppBundleIdentifier(input: {
  readonly appBundlePath: string;
  readonly run?: IosCommandRunner;
}): Promise<string> {
  const plistPath = `${input.appBundlePath}/Info.plist`;
  let raw: string;
  try {
    raw = readFileSync(plistPath, "utf8");
  } catch {
    throw capableHistoryJourneyError("app-bundle-unreadable", plistPath);
  }
  const fromText = parseIosInfoPlistBundleIdentifier(raw);
  if (fromText) return fromText;
  const run = input.run ?? defaultRunner;
  const result = await run("plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    "-o",
    "-",
    plistPath,
  ]);
  const identifier = result.code === 0 ? result.stdout.trim() : "";
  if (identifier.length === 0) {
    throw capableHistoryJourneyError(
      "app-bundle-identifier-missing",
      `no CFBundleIdentifier in ${plistPath}`,
    );
  }
  return identifier;
}
