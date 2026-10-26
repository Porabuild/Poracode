// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useReachableProjectFilter } from "./reachability";

describe("useReachableProjectFilter", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({ runtime: {} });
  });

  it("keeps local projects and projects on reachable servers, and follows reconnects", () => {
    useRemoteServersStore.setState({
      runtime: {
        online: { status: "online", projects: [], threads: [] },
        errored: { status: "error", projects: [], threads: [] },
        offline: { status: "offline", projects: [], threads: [] },
        connecting: { status: "connecting", projects: [], threads: [] },
      },
    });
    const { result } = renderHook(() => useReachableProjectFilter());

    expect(result.current({})).toBe(true);
    expect(result.current({ remoteServerId: "online" })).toBe(true);
    expect(result.current({ remoteServerId: "errored" })).toBe(true);
    expect(result.current({ remoteServerId: "offline" })).toBe(false);
    expect(result.current({ remoteServerId: "connecting" })).toBe(false);
    expect(result.current({ remoteServerId: "unknown" })).toBe(false);

    act(() => {
      useRemoteServersStore.setState({
        runtime: { offline: { status: "online", projects: [], threads: [] } },
      });
    });
    expect(result.current({ remoteServerId: "offline" })).toBe(true);
  });
});
