import { act, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { openThread } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  openPushThreadTarget,
  parsePushThreadPath,
  usePushThreadDeepLink,
} from "./pushThreadDeepLink";

vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: vi.fn<(threadId: string, options?: unknown) => void>(),
}));

describe("parsePushThreadPath", () => {
  it("parses the host's notification URL", () => {
    expect(parsePushThreadPath("/thread/host-thread-1")).toEqual({
      threadId: "host-thread-1",
      homePath: "/",
    });
  });

  it("keeps a deployment base path when cleaning the URL", () => {
    expect(parsePushThreadPath("/app/thread/host-thread-1/")).toEqual({
      threadId: "host-thread-1",
      homePath: "/app/",
    });
  });

  it("decodes the encoded thread id", () => {
    expect(parsePushThreadPath("/thread/remote%3Ahost%3Athread%3At1")?.threadId).toBe(
      "remote:host:thread:t1",
    );
  });

  it.each(["/", "/threads/t1", "/thread/", "/thread/a/b", "/other"])(
    "ignores an unrelated path (%s)",
    (path) => {
      expect(parsePushThreadPath(path)).toBeNull();
    },
  );
});

describe("openPushThreadTarget", () => {
  const base = {
    openLocalThread: vi.fn<(threadId: string) => void>(),
    openRemoteThread: vi.fn<(connectionKey: string, remoteId: string) => Promise<boolean>>(),
  };

  it("opens a cached remote row by its host id", async () => {
    base.openLocalThread.mockReset();
    base.openRemoteThread.mockReset();
    await expect(
      openPushThreadTarget("host-1", {
        ...base,
        threads: [{ id: "remote:d1:thread:host-1", remoteId: "host-1", remoteServerId: "d1" }],
        onlineConnections: ["d1"],
      }),
    ).resolves.toBe(true);
    expect(base.openLocalThread).toHaveBeenCalledWith("remote:d1:thread:host-1");
    expect(base.openRemoteThread).not.toHaveBeenCalled();
  });

  it("prefers a cached row whose host is online", async () => {
    base.openLocalThread.mockReset();
    await openPushThreadTarget("host-1", {
      ...base,
      threads: [
        { id: "remote:d2:thread:host-1", remoteId: "host-1", remoteServerId: "d2" },
        { id: "remote:d1:thread:host-1", remoteId: "host-1", remoteServerId: "d1" },
      ],
      onlineConnections: ["d1"],
    });
    expect(base.openLocalThread).toHaveBeenCalledWith("remote:d1:thread:host-1");
  });

  it("loads an uncached thread from the online host that owns it", async () => {
    base.openLocalThread.mockReset();
    base.openRemoteThread.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(
      openPushThreadTarget("host-9", {
        ...base,
        threads: [],
        onlineConnections: ["d1", "d2"],
      }),
    ).resolves.toBe(true);
    expect(base.openRemoteThread).toHaveBeenNthCalledWith(1, "d1", "host-9");
    expect(base.openRemoteThread).toHaveBeenNthCalledWith(2, "d2", "host-9");
    expect(base.openLocalThread).toHaveBeenCalledWith("remote:d2:thread:host-9");
  });

  it("returns false when no online host has the thread", async () => {
    base.openLocalThread.mockReset();
    base.openRemoteThread.mockReset().mockResolvedValue(false);
    await expect(
      openPushThreadTarget("missing", {
        ...base,
        threads: [],
        onlineConnections: ["d1"],
      }),
    ).resolves.toBe(false);
    expect(base.openLocalThread).not.toHaveBeenCalled();
  });

  it("opens a cached row even while its host is offline", async () => {
    base.openLocalThread.mockReset();
    await expect(
      openPushThreadTarget("host-1", {
        ...base,
        threads: [{ id: "remote:d1:thread:host-1", remoteId: "host-1", remoteServerId: "d1" }],
        onlineConnections: [],
      }),
    ).resolves.toBe(true);
    expect(base.openLocalThread).toHaveBeenCalledWith("remote:d1:thread:host-1");
  });
});

describe("usePushThreadDeepLink", () => {
  it("opens the notification's cached thread and replaces the URL", async () => {
    window.history.replaceState(null, "", "/thread/host-1");
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          endpoint: "http://127.0.0.1:1",
          accessToken: "token",
        } as never,
      ],
      runtime: { d1: { status: "online", projects: [], threads: [] } } as never,
    });
    useAppStore.setState({
      threads: [
        { id: "remote:d1:thread:host-1", remoteId: "host-1", remoteServerId: "d1" } as never,
      ],
    });

    render(
      createElement(function Probe() {
        usePushThreadDeepLink();
        return null;
      }),
    );

    await waitFor(() =>
      expect(openThread).toHaveBeenCalledWith(
        "remote:d1:thread:host-1",
        expect.objectContaining({ focusComposer: false, switchWorkspace: true }),
      ),
    );
    expect(window.location.pathname).toBe("/");
  });
});

describe("usePushThreadDeepLink retry boundary", () => {
  it("does not re-read a missing thread on unrelated runtime updates, but retries when a host returns", async () => {
    window.history.replaceState(null, "", "/thread/missing-thread");
    const openRemoteThread = vi
      .fn<(connectionKey: string, remoteId: string, options?: unknown) => Promise<boolean>>()
      .mockResolvedValue(false);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          endpoint: "http://127.0.0.1:1",
          accessToken: "token",
        } as never,
      ],
      runtime: { d1: { status: "online", projects: [], threads: [] } } as never,
      openRemoteThread: openRemoteThread as never,
    });
    useAppStore.setState({ threads: [] });

    render(
      createElement(function Probe() {
        usePushThreadDeepLink();
        return null;
      }),
    );

    await waitFor(() => expect(openRemoteThread).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    // A runtime refresh with the same online host must not re-read the absent
    // thread.
    useRemoteServersStore.setState({
      runtime: { d1: { status: "online", projects: [], threads: [], agentStatuses: {} } } as never,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(openRemoteThread).toHaveBeenCalledTimes(1);

    // A host transition is new evidence: retry once it is back online.
    useRemoteServersStore.setState({
      runtime: { d1: { status: "offline", projects: [], threads: [] } } as never,
    });
    await act(async () => {
      await Promise.resolve();
    });
    useRemoteServersStore.setState({
      runtime: { d1: { status: "online", projects: [], threads: [] } } as never,
    });
    await waitFor(() => expect(openRemoteThread).toHaveBeenCalledTimes(2));
  });
});
