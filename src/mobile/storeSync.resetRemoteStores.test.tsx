import { describe, expect, it, vi } from "vitest";

// The Live Activity controller pulls in a native bridge; stub it so importing
// storeSync stays jsdom-safe. Everything else resetRemoteStores touches is
// plain renderer state.
vi.mock("./push/liveActivityController", () => ({
  notifyLiveActivityThreadState: vi.fn<() => Promise<void>>(async () => {}),
}));

import { useAppStore } from "@/renderer/state/appStore";
import { resetRemoteStores } from "./storeSync";

describe("resetRemoteStores", () => {
  it("clears every per-thread runtime map (guards against reset↔slice drift)", () => {
    const tid = "thread-1";
    useAppStore.setState({
      projects: [{ id: "p" } as never],
      threads: [{ id: tid } as never],
      // A representative of the maps reset already cleared…
      runtimeStructuralVersionByThread: { [tid]: 3 },
      // …plus the four it used to leak across desktop switches (stale "running"
      // badges + unbounded growth).
      runtimeOpenTurnByThread: { [tid]: true },
      fileCheckpointsByThread: { [tid]: {} },
      fileCheckpointTurnsByThread: { [tid]: {} },
      openSubAgentByThread: { [tid]: "parent" },
    });

    resetRemoteStores();

    const s = useAppStore.getState();
    expect(s.projects).toHaveLength(0);
    expect(s.threads).toHaveLength(0);
    expect(s.runtimeStructuralVersionByThread).toEqual({});
    expect(s.runtimeOpenTurnByThread).toEqual({});
    expect(s.fileCheckpointsByThread).toEqual({});
    expect(s.fileCheckpointTurnsByThread).toEqual({});
    expect(s.openSubAgentByThread).toEqual({});
  });
});
