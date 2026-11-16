import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { MachineRef } from "@/shared/machines";
import { machineKey } from "@/shared/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useMachineScopedStatuses } from "./useMachineScopedStatuses";

function agent(
  kind: string,
  label: string,
  options: { envKind?: "windows" | "wsl"; envDistro?: string; authState?: "missing" } = {},
): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: options.authState ?? "authenticated",
    envKind: options.envKind ?? "windows",
    ...(options.envDistro ? { envDistro: options.envDistro } : {}),
  } as AgentStatus;
}

function machine(ref: MachineRef, kind: MachineDescriptor["kind"]): MachineDescriptor {
  return {
    id: machineKey(ref),
    ref,
    kind,
    label: machineKey(ref),
    status: "online",
    ...(ref.host === "remote" ? { desktopId: ref.desktopId } : {}),
    ...(ref.env.kind === "wsl" ? { wslDistro: ref.env.distro } : {}),
  };
}

const localNative = machine({ host: "local", env: { kind: "native" } }, "local");
const remoteNative = machine(
  { host: "remote", desktopId: "studio", env: { kind: "native" } },
  "remote",
);
const remoteUbuntu = machine(
  { host: "remote", desktopId: "studio", env: { kind: "wsl", distro: "Ubuntu" } },
  "remote-wsl",
);
const originalRuntime = useRemoteServersStore.getState().runtime;

beforeEach(() => {
  useAgentStatusesStore.setState({
    agentStatuses: [agent("codex", "Local Codex"), agent("claude", "Local Claude")],
    wslAgentStatuses: [
      agent("codex", "Local Codex Ubuntu", { envKind: "wsl", envDistro: "Ubuntu" }),
      agent("codex", "Local Codex Debian", {
        envKind: "wsl",
        envDistro: "Debian",
        authState: "missing",
      }),
    ],
  });
  useRemoteServersStore.setState({
    runtime: {
      ...originalRuntime,
      studio: {
        status: "online",
        projects: [],
        threads: [],
        agentStatuses: {
          windows: [agent("codex", "Host Codex")],
          wsl: [
            agent("codex", "Host Codex Ubuntu", { envKind: "wsl", envDistro: "Ubuntu" }),
            agent("codex", "Host Codex Debian", { envKind: "wsl", envDistro: "Debian" }),
          ],
          updatedAt: "2026-11-04T00:00:00.000Z",
        },
      },
    },
  });
});

const labels = (statuses: readonly AgentStatus[]) => statuses.map((status) => status.label);

describe("useMachineScopedStatuses", () => {
  it("scopes a local machine to its own environment of the agent", () => {
    const { result } = renderHook(() => useMachineScopedStatuses("codex", localNative));
    expect(labels(result.current.scoped)).toEqual(["Local Codex"]);
    expect(result.current.othersNeedingAttention).toEqual(["local/wsl:Debian"]);
  });

  it("scopes a remote machine to the paired host's matching environment", () => {
    const native = renderHook(() => useMachineScopedStatuses("codex", remoteNative));
    expect(labels(native.result.current.scoped)).toEqual(["Host Codex"]);
    const wsl = renderHook(() => useMachineScopedStatuses("codex", remoteUbuntu));
    expect(labels(wsl.result.current.scoped)).toEqual(["Host Codex Ubuntu"]);
  });

  it("keeps surfacing this device's auth problems while a remote machine is selected", () => {
    const { result } = renderHook(() => useMachineScopedStatuses("codex", remoteNative));
    expect(result.current.othersNeedingAttention).toEqual(["local/wsl:Debian"]);
  });
});
