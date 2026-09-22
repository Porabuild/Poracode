import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "@/shared/atomicFile";
import { defaultSharedSettings } from "@/shared/settings";
import { isHostResourcePolicyUnavailableError } from "@/shared/hostResourceAdmission";
import {
  HostResourceBusyError,
  HostResourcePolicyUnavailableError,
} from "./runtime/hostResourceAdmission";
import { SupervisorRuntime } from "./supervisorRuntime";

// Suppress supervisor console output so vitest's onUserConsoleLog RPC does not
// remain pending at worker teardown (same pattern as runtime.test.ts).
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const tempDirs: string[] = [];
const runtimesToDispose: SupervisorRuntime[] = [];
const poracodeDataDirBeforeTests = process.env.PORACODE_DATA_DIR;

function makeProfileDir(): { dir: string; settingsPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "poracode-admission-runtime-"));
  tempDirs.push(dir);
  return { dir, settingsPath: join(dir, "settings.json") };
}

function writeAdmissionDocument(settingsPath: string, admission: unknown): void {
  writeFileAtomic(
    settingsPath,
    `${JSON.stringify({ ...defaultSharedSettings, hostResourceAdmission: admission }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function makeRuntime(dir: string): SupervisorRuntime {
  process.env.PORACODE_DATA_DIR = dir;
  const runtime = new SupervisorRuntime(vi.fn<(event: unknown, meta?: unknown) => void>());
  runtimesToDispose.push(runtime);
  return runtime;
}

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(async () => {
  try {
    for (const runtime of runtimesToDispose.splice(0)) await runtime.disposeAsync();
  } finally {
    if (poracodeDataDirBeforeTests === undefined) {
      delete process.env.PORACODE_DATA_DIR;
    } else {
      process.env.PORACODE_DATA_DIR = poracodeDataDirBeforeTests;
    }
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  }
});

describe("SupervisorRuntime host resource admission wiring", () => {
  it("resolves a valid partial document and enforces the limit while controls stay available", () => {
    const { dir, settingsPath } = makeProfileDir();
    writeAdmissionDocument(settingsPath, { maxActiveAgentSessions: 1 });
    const runtime = makeRuntime(dir);

    const status = runtime.getResourceAdmissionStatus();
    expect(status.resolution).toEqual({ kind: "configured" });
    expect(status.policy).toEqual({
      maxActiveAgentSessions: 1,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
      overloadRetryAfterMs: 1_000,
    });
    expect(status.gitProcesses).toMatchObject({
      short: { limit: 8, active: 0, queued: 0 },
      long: { limit: 2, active: 0, queued: 0 },
    });

    const live = runtime.hostResourceAdmission.tryAcquire({
      resourceClass: "agent-session",
      key: "thread-a",
    });
    live.activate();
    expect(() =>
      runtime.hostResourceAdmission.tryAcquire({ resourceClass: "agent-session", key: "thread-b" }),
    ).toThrow(HostResourceBusyError);

    // Stop/cleanup stays available while full; capacity frees on confirmed exit.
    live.beginRetirement();
    live.confirmExit();
    const replacement = runtime.hostResourceAdmission.tryAcquire({
      resourceClass: "agent-session",
      key: "thread-b",
    });
    replacement.activate();
    expect(runtime.getResourceAdmissionStatus().usage.agentSessions).toMatchObject({ active: 1 });
  });

  it("honors an effective policy change without killing running work", async () => {
    const { dir, settingsPath } = makeProfileDir();
    writeAdmissionDocument(settingsPath, {
      maxActiveAgentSessions: 2,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    const runtime = makeRuntime(dir);

    const first = runtime.hostResourceAdmission.tryAcquire({
      resourceClass: "agent-session",
      key: "thread-a",
    });
    first.activate();
    const second = runtime.hostResourceAdmission.tryAcquire({
      resourceClass: "agent-session",
      key: "thread-b",
    });
    second.activate();

    // The watcher invalidation is asynchronous; the next status read is what
    // re-reads the document (ratified cache propagation). A write that lands
    // in the watcher registration window is covered by the cache's bounded
    // attach revalidation, so this poll cannot be starved by a lost event.
    writeAdmissionDocument(settingsPath, {
      maxActiveAgentSessions: 1,
      maxActiveTerminalShells: 0,
      maxActiveGenerationHelpers: 0,
    });
    await vi.waitFor(
      () => expect(runtime.getResourceAdmissionStatus().policy.maxActiveAgentSessions).toBe(1),
      { timeout: 2_000 },
    );

    // Live work is untouched; only the next counted start is refused. Freeing
    // one of the two still exceeds the lowered limit; freeing both recovers.
    expect(runtime.getResourceAdmissionStatus().usage.agentSessions).toMatchObject({ active: 2 });
    expect(() =>
      runtime.hostResourceAdmission.tryAcquire({ resourceClass: "agent-session", key: "thread-c" }),
    ).toThrow(HostResourceBusyError);
    first.confirmExit();
    expect(() =>
      runtime.hostResourceAdmission.tryAcquire({ resourceClass: "agent-session", key: "thread-c" }),
    ).toThrow(HostResourceBusyError);
    second.confirmExit();
    expect(
      runtime.hostResourceAdmission.tryAcquire({ resourceClass: "agent-session", key: "thread-c" }),
    ).toBeDefined();
  });

  it("fails closed on an invalid startup policy while status and cleanup stay available", () => {
    const { dir, settingsPath } = makeProfileDir();
    writeFileAtomic(settingsPath, "{not json", { encoding: "utf8", mode: 0o600 });
    const runtime = makeRuntime(dir);

    const status = runtime.getResourceAdmissionStatus();
    expect(status.resolution).toEqual({
      kind: "unavailable",
      problem: "settings-document-unparseable",
    });
    expect(status.policy.refuseNewStarts).toBe("settings-document-unparseable");
    expect(status.usage.total).toBe(0);

    let refusal: unknown;
    try {
      runtime.hostResourceAdmission.tryAcquire({ resourceClass: "agent-session", key: "thread-a" });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(HostResourcePolicyUnavailableError);
    expect(isHostResourcePolicyUnavailableError(refusal)).toBe(true);
    expect(runtime.getResourceAdmissionStatus().usage.refusals).toBe(1);
  });
});
