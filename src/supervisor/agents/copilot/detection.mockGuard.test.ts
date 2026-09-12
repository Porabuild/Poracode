import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_AGENTS_ENV } from "@/supervisor/agentLaunchGuard";
import type { AcpProbeResult } from "../acp";
import type { DetectProbeCtx } from "../base";

const mocks = vi.hoisted(() => ({
  probeAcpCapabilities:
    vi.fn<
      (
        command: string,
        args: string[],
        cwd: string,
        options?: { timeoutMs?: number; label?: string },
      ) => Promise<AcpProbeResult | undefined>
    >(),
}));

// Only the shared ACP probe is replaced (its refusal is covered by the guard
// suite); every other `../acp` export stays real for the capability merge.
vi.mock("../acp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../acp")>()),
  probeAcpCapabilities: mocks.probeAcpCapabilities,
}));

const spawnCalls = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: ((...args: Parameters<typeof actual.spawn>) => {
      spawnCalls(...args);
      return actual.spawn(...args);
    }) as typeof actual.spawn,
  };
});

import { copilotDetectionSpec } from "./detection";

/**
 * The fixture is the probe's `executablePath`, so a spawn executes it directly
 * on posix. It appends a marker the moment it runs, then sleeps to keep the
 * stdio pipes open for the ACP handshake; its absence under
 * `PORACODE_MOCK_AGENTS=1` is the evidence the process was never created.
 */
const sentinelDir = join(tmpdir(), "poracode-copilot-probe-guard-");
let workDir: string;
let sentinelFile: string;
let fixtureCommand: string;

beforeEach(() => {
  workDir = mkdtempSync(sentinelDir);
  sentinelFile = join(workDir, "sentinel.log");
  fixtureCommand = join(workDir, "fixture-copilot.sh");
  writeFileSync(
    fixtureCommand,
    [
      "#!/bin/sh",
      // The ACP session spawn inherits process.env (the probe passes no custom
      // env), so the sentinel path is baked into the script instead.
      `printf "ran:bypass\\n" >> "${sentinelFile}"`,
      "exec sleep 30",
      "",
    ].join("\n"),
  );
  chmodSync(fixtureCommand, 0o755);
  spawnCalls.mockClear();
  mocks.probeAcpCapabilities.mockReset();
  mocks.probeAcpCapabilities.mockResolvedValue({
    models: [{ id: "fixture-model", label: "Fixture Model" }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workDir, { recursive: true, force: true });
});

function mockSessionEnv(): void {
  vi.stubEnv(MOCK_AGENTS_ENV, "1");
  vi.stubEnv("PORACODE_IS_DEV", "1");
}

function realModeEnv(): void {
  vi.stubEnv(MOCK_AGENTS_ENV, "");
}

function sentinelRan(): string | undefined {
  return existsSync(sentinelFile) ? readFileSync(sentinelFile, "utf8") : undefined;
}

function probeCtx(signal?: AbortSignal): DetectProbeCtx {
  return {
    location: { kind: "posix", path: workDir },
    executablePath: fixtureCommand,
    ...(signal ? { signal } : {}),
  };
}

describe.skipIf(process.platform === "win32")("copilot model-effort probe mock-QA guard", () => {
  it("refuses the model-effort session without executing the fixture binary", async () => {
    mockSessionEnv();
    const result = await copilotDetectionSpec.capabilitiesProbe?.(probeCtx());

    expect(result?.models).toHaveLength(1);
    // `copilotDefaultCapabilities` always carries an (empty) efforts map.
    expect(result?.modelEfforts).toEqual({});
    expect(spawnCalls).not.toHaveBeenCalled();
    expect(sentinelRan()).toBeUndefined();
    // The probe's internal sweep timeout (15s) must never be reached here.
  }, 20_000);

  it("executes the fixture for the model-effort session without the flag (real-mode parity)", async () => {
    realModeEnv();
    const abort = new AbortController();
    const pending = copilotDetectionSpec.capabilitiesProbe?.(probeCtx(abort.signal));
    await vi.waitFor(() => expect(sentinelRan()).toBe("ran:bypass\n"));
    abort.abort();

    const result = await pending;
    expect(spawnCalls).toHaveBeenCalledOnce();
    expect(spawnCalls.mock.calls[0]?.[0]).toBe(fixtureCommand);
    // The fixture does not speak ACP, so the aborted sweep reports no efforts.
    expect(result?.modelEfforts).toEqual({});
    expect(result?.models).toHaveLength(1);
  });
});
