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

import { clearExecutablePathCache, detectAgentInstall, type DetectionSpec } from "./base";

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
});
