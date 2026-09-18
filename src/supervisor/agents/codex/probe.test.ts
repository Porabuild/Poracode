import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { MOCK_AGENTS_ENV } from "@/supervisor/agentLaunchGuard";

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

// Keep the goals-flag arg builder off the real `codex --version` probe; the
// launch guard under test must be the only reason the fixture never runs.
vi.mock("./plugin/install", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./plugin/install")>()),
  probeCodexCliSemver: () => null,
}));

import { probeCodexAccount, probeCodexCapabilities } from "./probe";

/**
 * The fixture is a real local executable handed to the probe as the app-server
 * binary. It appends a marker the moment it runs, so its absence under
 * `PORACODE_MOCK_AGENTS=1` is the evidence the process was never created.
 */
const sentinelDir = join(tmpdir(), "poracode-codex-probe-guard-");
let workDir: string;
let sentinelFile: string;
let fixtureCommand: string;

beforeEach(() => {
  workDir = mkdtempSync(sentinelDir);
  sentinelFile = join(workDir, "sentinel.log");
  fixtureCommand = join(workDir, "fixture-codex.sh");
  writeFileSync(
    fixtureCommand,
    [
      "#!/bin/sh",
      // The app-server spawn inherits process.env (the probe adds no custom
      // env), so the sentinel path is baked into the script instead.
      `printf "ran:bypass\\n" >> "${sentinelFile}"`,
      "",
    ].join("\n"),
  );
  chmodSync(fixtureCommand, 0o755);
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

function posixLocation(): ProjectLocation {
  return { kind: "posix", path: workDir };
}

function sentinelRan(): string | undefined {
  return existsSync(sentinelFile) ? readFileSync(sentinelFile, "utf8") : undefined;
}

describe.skipIf(process.platform === "win32")("codex probe mock-QA guard", () => {
  beforeEach(() => {
    spawnCalls.mockClear();
  });

  it("refuses the account probe without executing the fixture binary", async () => {
    mockSessionEnv();
    await expect(
      probeCodexAccount(posixLocation(), { wslExecPath: fixtureCommand, timeoutMs: 5_000 }),
    ).resolves.toBeUndefined();
    expect(spawnCalls).not.toHaveBeenCalled();
    expect(sentinelRan()).toBeUndefined();
  });

  it("refuses the capability probe without a spawn attempt", async () => {
    mockSessionEnv();
    await expect(
      probeCodexCapabilities(posixLocation(), { wslExecPath: fixtureCommand, timeoutMs: 5_000 }),
    ).resolves.toBeUndefined();
    expect(spawnCalls).not.toHaveBeenCalled();
    expect(sentinelRan()).toBeUndefined();
  });

  it("spawns and executes the fixture binary without the flag (real-mode parity)", async () => {
    realModeEnv();
    await expect(
      probeCodexAccount(posixLocation(), { wslExecPath: fixtureCommand, timeoutMs: 3_000 }),
    ).resolves.toBeUndefined();
    expect(spawnCalls).toHaveBeenCalledOnce();
    expect(spawnCalls.mock.calls[0]?.[0]).toBe(fixtureCommand);
    expect(sentinelRan()).toBe("ran:bypass\n");
  });
});
