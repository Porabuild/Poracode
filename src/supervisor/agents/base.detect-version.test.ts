import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "@/shared/contracts";

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr?: string }>>(),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { promisify } = require("node:util") as typeof import("node:util");
  return {
    ...actual,
    execFile: Object.assign(vi.fn(), {
      [promisify.custom]: execFileAsyncMock,
    }),
  };
});

import {
  clearExecutablePathCache,
  detectAgentInstall,
  setWslProcessBridgeClient,
  type DetectionSpec,
} from "./base";

const capabilities: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

const spec: DetectionSpec = {
  kind: "grok",
  label: "Grok Build",
  binary: "grok",
  capabilities,
};

describe("detectAgentInstall version probe", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Use a posix probe location so the version command is built without the
    // PowerShell base64 wrapping, keeping the spawn args readable to assert on.
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    clearExecutablePathCache();
    execFileAsyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    vi.restoreAllMocks();
  });

  it("reads the version from the resolved binary path, not the bare name on PATH", async () => {
    // 1) binary resolution (`command -v grok`) returns an absolute path the
    //    supervisor's stale PATH would not contain; 2) the version probe runs.
    execFileAsyncMock.mockImplementation(async (_cmd: unknown, args: unknown) => {
      const joined = (Array.isArray(args) ? args : []).join(" ");
      if (joined.includes("command -v")) return { stdout: "/opt/tools/grok\n", stderr: "" };
      return { stdout: "grok version 1.2.3\n", stderr: "" };
    });

    const status = await detectAgentInstall(undefined, spec);

    expect(status.installed).toBe(true);
    expect(status.version).toBe("1.2.3");
    // The probe must invoke the resolved absolute path directly — the previous
    // bug re-ran the bare `grok` through PATH, which misses a CLI installed
    // after launch.
    expect(execFileAsyncMock).toHaveBeenCalledWith(
      "/opt/tools/grok",
      ["--version"],
      expect.anything(),
    );
  });

  it("extracts the full semver from a v-prefixed version string", async () => {
    // Regression: `\b\d+\.\d+…` could not match right after a leading `v`
    // (no word boundary between two word characters), so "v24.14.0" was
    // mis-extracted as "14.0" — surfacing a phantom newer version in the UI.
    execFileAsyncMock.mockImplementation(async (_cmd: unknown, args: unknown) => {
      const joined = (Array.isArray(args) ? args : []).join(" ");
      if (joined.includes("command -v")) return { stdout: "/opt/tools/grok\n", stderr: "" };
      return { stdout: "v24.14.0\n", stderr: "" };
    });

    const status = await detectAgentInstall(undefined, spec);

    expect(status.version).toBe("24.14.0");
  });
});

describe("detectAgentInstall WSL interop guard", () => {
  const originalPlatform = process.platform;
  // WSL `command -v` output the fake bridge returns for the binary probe; set
  // per test. The branch routes WSL detection through the in-distro bridge
  // (batchWslCommandsAsync -> processBatch), not a direct wsl.exe spawn, so the
  // test wires a fake bridge client rather than mocking execFile.
  let commandVStdout = "";

  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    clearExecutablePathCache();
    execFileAsyncMock.mockReset();
    setWslProcessBridgeClient({
      processBatch: async (_location: unknown, input: { commands: unknown[] }) => ({
        results: input.commands.map(() => ({
          ok: commandVStdout.length > 0,
          stdout: commandVStdout,
          stderr: "",
          exitCode: commandVStdout.length > 0 ? 0 : 1,
        })),
      }),
      processExec: async () => ({
        ok: true,
        stdout: "grok version 1.2.3",
        stderr: "",
        exitCode: 0,
      }),
    } as never);
  });

  afterEach(() => {
    setWslProcessBridgeClient(undefined);
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    vi.restoreAllMocks();
  });

  it("treats a Windows binary surfaced via /mnt interop as not installed in WSL", async () => {
    // `command -v` inside the distro resolves a Windows-only install (npm
    // global) through `/mnt/c` PATH interop. That is not a real Linux install,
    // so the card must not report "Detected" in WSL.
    commandVStdout = "/mnt/c/Users/x/AppData/Roaming/npm/grok";

    const status = await detectAgentInstall({ envKind: "wsl", wslDistro: "Interop-Test" }, spec);

    expect(status.installed).toBe(false);
    expect(status.executablePath).toBeUndefined();
  });

  it("accepts a genuine Linux install path in WSL", async () => {
    commandVStdout = "/home/x/.local/bin/grok";

    const status = await detectAgentInstall({ envKind: "wsl", wslDistro: "Linux-Test" }, spec);

    expect(status.installed).toBe(true);
    expect(status.executablePath).toBe("/home/x/.local/bin/grok");
  });
});
