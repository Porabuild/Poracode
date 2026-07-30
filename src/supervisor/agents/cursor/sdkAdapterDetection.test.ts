import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentEnvContext, DetectionSpec } from "../base";
import type { CursorSdkRuntimeProbe } from "./sdkDetection";
import type { CursorStructuredRuntime } from "./structuredRuntime";

const mocks = vi.hoisted(() => ({
  detectAgentInstall:
    vi.fn<(ctx: AgentEnvContext | undefined, spec: DetectionSpec) => Promise<AgentStatus>>(),
  probeCursorSdkRuntime:
    vi.fn<(ctx: AgentEnvContext | undefined) => Promise<CursorSdkRuntimeProbe>>(),
  applyCursorSdkProbe:
    vi.fn<
      (
        status: AgentStatus,
        probe: CursorSdkRuntimeProbe,
        selectedRuntime: CursorStructuredRuntime,
      ) => AgentStatus
    >(),
}));

vi.mock("../base", async (importActual) => {
  const actual = await importActual<typeof import("../base")>();
  return { ...actual, detectAgentInstall: mocks.detectAgentInstall };
});

vi.mock("./sdkDetection", () => ({
  probeCursorSdkRuntime: mocks.probeCursorSdkRuntime,
  applyCursorSdkProbe: mocks.applyCursorSdkProbe,
}));

vi.mock("../binaryResolver", () => ({
  resolveAgentBinaryPath: () => undefined,
}));

vi.mock("../base/processRuntime", async (importActual) => {
  const actual = await importActual<typeof import("../base/processRuntime")>();
  return { ...actual, resolveWslShellPath: () => "/bin/bash" };
});

import { createCursorAdapter } from "./index";

const cliStatus: AgentStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "cli-model", label: "CLI Model" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent", "plan"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    presentationModes: ["terminal", "gui"],
    settingDefs: [],
  },
};

describe("Cursor adapter SDK detection selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectAgentInstall.mockResolvedValue(cliStatus);
    mocks.probeCursorSdkRuntime.mockResolvedValue({
      installed: true,
      authState: "authenticated",
      models: [{ id: "sdk-model", displayName: "SDK Model" }],
    });
    mocks.applyCursorSdkProbe.mockReturnValue({
      ...cliStatus,
      presentationAuthStates: { terminal: "authenticated", gui: "authenticated" },
    });
  });

  it("probes and merges the external SDK when SDK mode is selected", async () => {
    const adapter = createCursorAdapter();
    const context = {
      envKind: "posix" as const,
      agentSettings: { structuredRuntime: "sdk" },
    };
    const result = await adapter.detectInstall(context);

    expect(mocks.detectAgentInstall).toHaveBeenCalledWith(context, expect.any(Object));
    expect(mocks.probeCursorSdkRuntime).toHaveBeenCalledWith(context);
    expect(mocks.applyCursorSdkProbe).toHaveBeenCalledWith(
      cliStatus,
      expect.objectContaining({ models: [{ id: "sdk-model", displayName: "SDK Model" }] }),
      "sdk",
    );
    expect(result.presentationAuthStates?.gui).toBe("authenticated");
  });

  it("still probes and retains the SDK runtime while ACP is selected", async () => {
    const adapter = createCursorAdapter();
    const context = { envKind: "posix" as const };
    await adapter.detectInstall(context);
    expect(mocks.probeCursorSdkRuntime).toHaveBeenCalledWith(context);
    expect(mocks.applyCursorSdkProbe).toHaveBeenCalledWith(
      cliStatus,
      expect.objectContaining({ models: [{ id: "sdk-model", displayName: "SDK Model" }] }),
      "acp",
    );
  });

  it("keeps process-wide routing immutable across divergent environment probes", async () => {
    mocks.applyCursorSdkProbe.mockImplementation((status, probe) => ({
      ...status,
      capabilities: {
        ...status.capabilities,
        liveInputMode: probe.models[0]?.id === "wsl-model" ? "server" : "terminal",
        presentationMode: "gui",
      },
    }));
    mocks.probeCursorSdkRuntime.mockImplementation(async (context) => ({
      installed: true,
      authState: "authenticated",
      models: [
        {
          id: context?.envKind === "wsl" ? "wsl-model" : "native-model",
          displayName: "SDK Model",
        },
      ],
    }));
    const adapter = createCursorAdapter();

    const [native, wsl] = await Promise.all([
      adapter.detectInstall({
        envKind: "posix",
        agentSettings: { structuredRuntime: "sdk" },
      }),
      adapter.detectInstall({
        envKind: "wsl",
        wslDistro: "Ubuntu",
        agentSettings: { structuredRuntime: "sdk" },
      }),
    ]);

    expect(native.capabilities.liveInputMode).toBe("terminal");
    expect(wsl.capabilities.liveInputMode).toBe("server");
    expect(adapter.capabilities.liveInputMode).toBe("terminal");
    expect(adapter.capabilities.presentationMode).toBe("terminal");
  });
});
