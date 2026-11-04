import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recover: vi.fn<(threadId: string) => void>() }));
vi.mock("@/renderer/state/remote/sync", () => ({ recoverRuntimeHistory: mocks.recover }));

import type { EventSocketConnectionContext } from "./eventSocketContext";
import { bindEventSocketResync, recoverInterestedThreads } from "./eventSocketResync";
import {
  __resetEventSocketRegistryForTest,
  setRemoteServerThreadItemInterests,
} from "./eventSocketRegistry";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { RemoteServerRecord, RemoteServersState } from "./types";

const PARENT_KEY = "conn-parent";
const ENV_KEY = "conn-child";
const CHILD_DESKTOP = "child-desktop";

function environmentRecord(): RemoteServerRecord {
  return {
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
}

function context(openThread: { desktopId: string; threadId: string } | null = null) {
  const entry = {} as EventSocketConnectionContext["entry"];
  const ctx = {
    server: environmentRecord(),
    entry,
    get: () => ({ openThread }) as unknown as RemoteServersState,
  } as unknown as EventSocketConnectionContext;
  return ctx;
}

afterEach(() => {
  __resetEventSocketRegistryForTest();
  mocks.recover.mockReset();
});

describe("eventSocketResync", () => {
  it("recovers every interested thread under the environment connection key, through the live reducer", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1", "thread-2"], true);
    await expect(recoverInterestedThreads(context())).resolves.toBe(true);
    expect(mocks.recover.mock.calls.map(([threadId]) => threadId).sort()).toEqual([
      remoteThreadId(ENV_KEY, "thread-1"),
      remoteThreadId(ENV_KEY, "thread-2"),
    ]);
  });

  it("never recovers the same child's direct-record interests through the environment connection", async () => {
    setRemoteServerThreadItemInterests(CHILD_DESKTOP, ["thread-1"], true);
    await recoverInterestedThreads(context());
    expect(mocks.recover).not.toHaveBeenCalled();
  });

  it("includes the connection's open thread, once", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    await recoverInterestedThreads(context({ desktopId: ENV_KEY, threadId: "thread-1" }));
    expect(mocks.recover).toHaveBeenCalledExactlyOnceWith(remoteThreadId(ENV_KEY, "thread-1"));
  });

  it("recovers only the given threads when scoped", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1", "thread-2"], true);
    await recoverInterestedThreads(context(), new Set(["thread-2"]));
    expect(mocks.recover).toHaveBeenCalledExactlyOnceWith(remoteThreadId(ENV_KEY, "thread-2"));
  });

  it("binds onto the connection context and its registry entry", () => {
    const ctx = context();
    bindEventSocketResync(ctx);
    expect(ctx.recoverInterestedThreads).toBeTypeOf("function");
    expect(ctx.entry.recoverInterestedThreads).toBe(ctx.recoverInterestedThreads);
  });
});
