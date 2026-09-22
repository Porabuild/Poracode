import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetConnectionRefreshForTest, scheduleServerRefresh } from "./connectionRefresh";
import type { RemoteServerRecord, RemoteServersState } from "./types";

const PARENT_KEY = "conn-parent";
const ENV_KEY = "conn-child";
const CHILD_DESKTOP = "child-desktop";

const parent: RemoteServerRecord = {
  connectionId: PARENT_KEY,
  desktopId: "parent-desktop",
  label: "Parent",
  endpoint: "http://127.0.0.1:49153/",
  accessToken: "parent-access",
  scopes: ["session:read"],
  transport: { kind: "direct" },
} as RemoteServerRecord;

const environment: RemoteServerRecord = {
  connectionId: ENV_KEY,
  desktopId: CHILD_DESKTOP,
  label: "Child",
  endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
  accessToken: "child-access",
  scopes: ["session:read"],
  transport: {
    kind: "environment",
    parentConnectionId: PARENT_KEY,
    environmentId: "11111111-1111-4111-8111-111111111111",
    childDesktopId: CHILD_DESKTOP,
  },
} as RemoteServerRecord;

function stateWith(servers: RemoteServerRecord[]): {
  state: RemoteServersState;
  refreshServer: ReturnType<typeof vi.fn>;
} {
  const refreshServer = vi.fn<() => Promise<void>>(async () => undefined);
  return {
    state: { servers, refreshServer } as unknown as RemoteServersState,
    refreshServer,
  };
}

afterEach(() => {
  __resetConnectionRefreshForTest();
  vi.useRealTimers();
});

describe("scheduleServerRefresh connection keys (C1 F2)", () => {
  it("dispatches the debounced refresh for an environment connection key", async () => {
    vi.useFakeTimers();
    const { state, refreshServer } = stateWith([parent, environment]);
    scheduleServerRefresh(() => state, ENV_KEY, { includeAgentStatuses: true });
    await vi.advanceTimersByTimeAsync(700);
    expect(refreshServer).toHaveBeenCalledWith(ENV_KEY, { includeAgentStatuses: true });
  });

  it("does not schedule when only the child host identity matches", async () => {
    vi.useFakeTimers();
    const { state, refreshServer } = stateWith([parent, environment]);
    scheduleServerRefresh(() => state, CHILD_DESKTOP);
    await vi.advanceTimersByTimeAsync(700);
    expect(refreshServer).not.toHaveBeenCalled();
  });
});
