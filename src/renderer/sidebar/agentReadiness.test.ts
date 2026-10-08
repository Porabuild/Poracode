import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";

const h = vi.hoisted(() => ({
  runtime: {} as Record<string, RemoteServerRuntime>,
  refreshServer:
    vi.fn<(key: string, options: { includeAgentStatuses: boolean }) => Promise<void>>(),
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({ runtime: h.runtime, refreshServer: h.refreshServer }),
  },
}));
import { installSidebarAgentReadiness, sidebarAgentsPending } from "./agentReadiness";
import { agentStatusSchema } from "@/shared/contracts";

const unavailable = agentStatusSchema.parse({
  kind: "acp-generic:fixture",
  label: "Fixture",
  authState: "missing",
  installed: false,
  envKind: "windows",
  capabilities: {
    models: [],
    efforts: [],
    supportsSlashCommands: false,
    supportsFork: false,
    presentationMode: "terminal",
  },
});
const cold = (): RemoteServerRuntime => ({
  status: "online",
  projects: [],
  threads: [],
  agentStatuses: { windows: [], wsl: [], updatedAt: "now" },
});
beforeEach(() => {
  vi.useFakeTimers();
  h.runtime = { host: cold() };
  h.refreshServer.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("sidebar cold-host agent readiness", () => {
  it("re-reads an empty startup cache until the host publishes a verdict, then stops", async () => {
    h.refreshServer.mockImplementation(async () => {
      if (h.refreshServer.mock.calls.length === 2)
        h.runtime.host = {
          ...h.runtime.host!,
          agentStatuses: { windows: [unavailable], wsl: [], updatedAt: "ready" },
        };
    });
    const stop = installSidebarAgentReadiness("host");
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.refreshServer).toHaveBeenCalledTimes(2);
    expect(h.refreshServer).toHaveBeenCalledWith("host", { includeAgentStatuses: true });
    expect(sidebarAgentsPending(h.runtime.host)).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.refreshServer).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not poll a ready host or let an unmounted client's late reply start another read", async () => {
    h.runtime.host = {
      ...h.runtime.host!,
      agentStatuses: { windows: [unavailable], wsl: [], updatedAt: "ready" },
    };
    installSidebarAgentReadiness("host")();
    expect(h.refreshServer).not.toHaveBeenCalled();
    h.runtime.host = cold();
    let resolve: () => void = () => {};
    h.refreshServer.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const stop = installSidebarAgentReadiness("host");
    stop();
    resolve();
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.refreshServer).toHaveBeenCalledOnce();
  });
});
