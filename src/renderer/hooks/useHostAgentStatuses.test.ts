import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus, ProjectLocation } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  selectLocationAgentStatuses,
  useHostAgentsDetecting,
  useHostAgentStatusPools,
  useHostAgentStatuses,
} from "./useHostAgentStatuses";

function agent(
  kind: string,
  options: { installed?: boolean; envKind?: "windows" | "wsl"; envDistro?: string } = {},
): AgentStatus {
  return {
    kind,
    label: kind,
    installed: options.installed ?? true,
    authState: "authenticated",
    envKind: options.envKind ?? "windows",
    ...(options.envDistro ? { envDistro: options.envDistro } : {}),
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
      presentationMode: "gui",
      settingDefs: [],
    },
  };
}

const nativeLocation: ProjectLocation = { kind: "windows", path: "C:\\repo" };
const ubuntu: ProjectLocation = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
};

const originalRuntime = useRemoteServersStore.getState().runtime;

function seedPairedHost(
  statuses: { windows: AgentStatus[]; wsl: AgentStatus[] } | undefined,
  status: "online" | "connecting" = "online",
) {
  useRemoteServersStore.setState({
    runtime: {
      studio: {
        status,
        projects: [],
        threads: [],
        ...(statuses
          ? { agentStatuses: { ...statuses, updatedAt: "2026-11-04T00:00:00.000Z" } }
          : {}),
      },
    },
  });
}

beforeEach(() => {
  useAgentStatusesStore.setState({
    agentStatuses: [agent("managed-native"), agent("managed-missing", { installed: false })],
    wslAgentStatuses: [
      agent("managed-ubuntu", { envKind: "wsl", envDistro: "Ubuntu" }),
      agent("managed-debian", { envKind: "wsl", envDistro: "Debian" }),
    ],
    windowsLoaded: true,
    wslLoaded: true,
  });
  useRemoteServersStore.setState({ runtime: originalRuntime });
  seedPairedHost({
    windows: [agent("paired-native"), agent("paired-missing", { installed: false })],
    wsl: [
      agent("paired-ubuntu", { envKind: "wsl", envDistro: "Ubuntu" }),
      agent("paired-debian", { envKind: "wsl", envDistro: "Debian" }),
    ],
  });
});

const kinds = (statuses: readonly AgentStatus[]) => statuses.map((status) => status.kind);

describe("selectLocationAgentStatuses", () => {
  const pools = { windows: [agent("a"), agent("b", { installed: false })], wsl: [] };

  it("returns no statuses without a location", () => {
    expect(selectLocationAgentStatuses(pools, undefined)).toEqual([]);
  });

  it("narrows to installed agents on request", () => {
    expect(kinds(selectLocationAgentStatuses(pools, nativeLocation))).toEqual(["a", "b"]);
    expect(kinds(selectLocationAgentStatuses(pools, nativeLocation, true))).toEqual(["a"]);
  });
});

describe("useHostAgentStatusPools", () => {
  it("reads the managed host's pools from the local status store", () => {
    const { result } = renderHook(() => useHostAgentStatusPools(undefined));
    expect(kinds(result.current.windows)).toEqual(["managed-native", "managed-missing"]);
    expect(kinds(result.current.wsl)).toEqual(["managed-ubuntu", "managed-debian"]);
  });

  it("reads a paired host's pools from its connection runtime", () => {
    const { result } = renderHook(() => useHostAgentStatusPools("studio"));
    expect(kinds(result.current.windows)).toEqual(["paired-native", "paired-missing"]);
    expect(kinds(result.current.wsl)).toEqual(["paired-ubuntu", "paired-debian"]);
  });

  it("is empty for a paired host that has reported no statuses", () => {
    seedPairedHost(undefined);
    const { result } = renderHook(() => useHostAgentStatusPools("studio"));
    expect(result.current).toEqual({ windows: [], wsl: [] });
    const unknown = renderHook(() => useHostAgentStatusPools("gone"));
    expect(unknown.result.current).toEqual({ windows: [], wsl: [] });
  });
});

describe("useHostAgentStatuses", () => {
  it("scopes the managed host to the project's environment", () => {
    const native = renderHook(() => useHostAgentStatuses(undefined, nativeLocation));
    expect(kinds(native.result.current)).toEqual(["managed-native", "managed-missing"]);
    const wsl = renderHook(() => useHostAgentStatuses(undefined, ubuntu));
    expect(kinds(wsl.result.current)).toEqual(["managed-ubuntu"]);
  });

  it("scopes a paired host the same way, to its own pools", () => {
    const native = renderHook(() => useHostAgentStatuses("studio", nativeLocation));
    expect(kinds(native.result.current)).toEqual(["paired-native", "paired-missing"]);
    const wsl = renderHook(() => useHostAgentStatuses("studio", ubuntu));
    expect(kinds(wsl.result.current)).toEqual(["paired-ubuntu"]);
  });

  it("filters to installed agents on either host when asked", () => {
    const managed = renderHook(() =>
      useHostAgentStatuses(undefined, nativeLocation, { installedOnly: true }),
    );
    expect(kinds(managed.result.current)).toEqual(["managed-native"]);
    const paired = renderHook(() =>
      useHostAgentStatuses("studio", nativeLocation, { installedOnly: true }),
    );
    expect(kinds(paired.result.current)).toEqual(["paired-native"]);
  });

  it("offers nothing without a location, and keeps a stable list across renders", () => {
    const none = renderHook(() => useHostAgentStatuses(undefined, undefined));
    expect(none.result.current).toEqual([]);
    const hook = renderHook(() => useHostAgentStatuses("studio", nativeLocation));
    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });
});

describe("useHostAgentsDetecting", () => {
  it("follows the managed host's scan for the location's environment", () => {
    useAgentStatusesStore.setState({ windowsLoaded: true, wslLoaded: false });
    expect(renderHook(() => useHostAgentsDetecting(undefined, nativeLocation)).result.current).toBe(
      false,
    );
    expect(renderHook(() => useHostAgentsDetecting(undefined, ubuntu)).result.current).toBe(true);
    expect(renderHook(() => useHostAgentsDetecting(undefined, undefined)).result.current).toBe(
      false,
    );
  });

  it("follows a paired host's connection while it is establishing", () => {
    seedPairedHost(undefined, "connecting");
    expect(renderHook(() => useHostAgentsDetecting("studio", nativeLocation)).result.current).toBe(
      true,
    );
    seedPairedHost(undefined, "online");
    expect(renderHook(() => useHostAgentsDetecting("studio", nativeLocation)).result.current).toBe(
      false,
    );
  });
});
