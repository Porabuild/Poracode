import { afterEach, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import {
  installBrowserClientRuntime,
  resetClientRuntimeForTest,
  UNKNOWN_HOST_CAPABILITIES,
} from "@/renderer/clientRuntime";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import type { RemoteServersState } from "./types";
import { __resetBrowserBridgeForTest, syncDesktopBrowserBridgeClient } from "./browserBridge";

vi.mock("@/renderer/browser/remoteBridge", () => ({ setRemoteBridgeClient: vi.fn<() => void>() }));
vi.mock("@/renderer/browser/remoteSettingsSync", () => ({
  applyDesktopSettings: vi.fn<() => void>(),
  resetDesktopSettings: vi.fn<() => void>(),
}));

function catalogStatus(): AgentStatus {
  return {
    kind: "claude",
    label: "Claude Code",
    installed: true,
    authState: "authenticated",
    capabilities: {
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
      presentationModes: ["terminal"],
      settingDefs: [],
      slashCommands: [
        {
          id: "review",
          label: "Review",
          description: "Review the diff.",
          skillPath: "/skills/review/SKILL.md",
        },
      ],
    },
  };
}

/** A paired host whose runtime statuses already carry a spliced catalog. */
function pairedState(status: AgentStatus): RemoteServersState {
  return {
    servers: [
      {
        desktopId: "first",
        endpoint: "http://first.test/",
        accessToken: "first",
        hostCapabilities: UNKNOWN_HOST_CAPABILITIES,
      },
    ],
    runtime: { first: { status: "online", agentStatuses: { windows: [status], wsl: [] } } },
    clientFactory: () => ({
      settings: async () => {
        throw new Error("unused");
      },
    }),
  } as unknown as RemoteServersState;
}

afterEach(() => {
  __resetBrowserBridgeForTest();
  resetClientRuntimeForTest();
  Reflect.deleteProperty(window, "poracode");
  useAgentStatusesStore.setState({
    agentStatuses: [],
    wslAgentStatuses: [],
    windowsLoaded: false,
    wslLoaded: false,
  });
  localStorage.removeItem("poracode-agent-statuses-v1");
});

// The socket-close path calls syncDesktopBrowserBridgeClient from a WebSocket
// `onclose` handler. A rejected agent-status persist write used to escape it
// as an uncaught QuotaExceededError and took the renderer to the crash screen
// before the reconnect was scheduled.
it("survives a quota-exceeded status write in the socket-close sync path", () => {
  window.poracode = {} as PoracodeBridge;
  installBrowserClientRuntime(window.poracode);
  const status = catalogStatus();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  });
  try {
    expect(() => syncDesktopBrowserBridgeClient(pairedState(status))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "[localStorage] failed to persist %s",
      "poracode-agent-statuses-v1",
      expect.anything(),
    );
  } finally {
    setItem.mockRestore();
    warn.mockRestore();
  }
  expect(useAgentStatusesStore.getState().agentStatuses).toEqual([status]);
});

it("copies spliced catalogs into the store without persisting them", () => {
  window.poracode = {} as PoracodeBridge;
  installBrowserClientRuntime(window.poracode);
  const status = catalogStatus();
  syncDesktopBrowserBridgeClient(pairedState(status));
  expect(useAgentStatusesStore.getState().agentStatuses).toEqual([status]);
  const stored = localStorage.getItem("poracode-agent-statuses-v1")!;
  expect(JSON.parse(stored).state.agentStatuses[0].kind).toBe("claude");
  expect(stored).not.toContain("slashCommands");
});
