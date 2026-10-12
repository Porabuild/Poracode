import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { getCachedThreadGallery } from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import { useAppStore } from "../appStore";
import { forgetThreadRuntimeWindow } from "../chatRuntimePersister";
import { remoteThreadId } from "../remoteProjection";
import { createInitialRuntimeEventState, type RuntimeChatItem } from "../slices/runtimeEventSlice";
import { clearThreadGalleryCache } from "../threadGalleryCache";
import { applyThreadSnapshot, clearPendingRuntimeEvents } from "./sync";

const threadId = remoteThreadId("gallery-server", "history");
const original = useAppStore.getState();

function seed() {
  const thread = useAppStore.getState().createThread({
    threadId,
    projectId: "project",
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Gallery snapshot owner",
    presentationMode: "gui",
    focus: false,
    suppressHostCreateIntent: true,
    remoteServerId: "gallery-server",
    remoteId: "history",
  });
  const ids = ["head", "retired-tail"];
  const items: Record<string, RuntimeChatItem> = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        type: "assistant_message",
        state: "completed",
        payload: {},
        streams: { assistant_text: "History" },
      },
    ]),
  );
  useAppStore.setState({
    runtimeItemIdsByThread: { [threadId]: ids },
    runtimeItemsByIdByThread: { [threadId]: items },
  });
  const revision = { structuralVersion: 1, remoteRevision: "", locale: "en", imageAuthority: null };
  const read = () => getCachedThreadGallery(threadId, ids, items, {}, revision);
  const result = read();
  const snapshot: RemoteThreadSnapshot = {
    snapshotSeq: 10,
    thread: { ...thread, status: "idle" },
    runtimeItems: [
      {
        id: "head",
        type: "assistant_message",
        state: "completed",
        payload: {},
        streams: { assistant_text: "Fresh" },
      },
    ],
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  };
  return { read, result, snapshot };
}

beforeEach(() => {
  clearThreadGalleryCache();
  useAppStore.setState({
    ...createInitialRuntimeEventState(),
    threads: [],
    view: { kind: "home" },
  });
});

afterEach(() => {
  clearPendingRuntimeEvents();
  forgetThreadRuntimeWindow(threadId);
  clearThreadGalleryCache();
  useAppStore.setState(original, true);
});

describe("gallery ownership at snapshot installation", () => {
  it("retires unread prior input only after an accepted authoritative replacement", () => {
    const before = seed();
    expect(
      applyThreadSnapshot(before.snapshot, { fromServer: true, lastSeenEventSeq: 10 })
        .installedAuthoritativeHistory,
    ).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["head"]);
    expect(before.read()).not.toBe(before.result);
  });

  it("preserves unread inputs when the snapshot is stale", () => {
    const before = seed();
    const previous = useAppStore.getState().runtimeItemsByIdByThread[threadId];
    expect(
      applyThreadSnapshot(
        { ...before.snapshot, snapshotSeq: 5 },
        { fromServer: true, lastSeenEventSeq: 10 },
      ).installedAuthoritativeHistory,
    ).toBe(false);
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]).toBe(previous);
    expect(before.read()).toBe(before.result);
  });

  it("preserves inputs when conservative cached history is declined", () => {
    const before = seed();
    expect(
      applyThreadSnapshot(before.snapshot, { fromServer: false }).installedAuthoritativeHistory,
    ).toBe(false);
    expect(before.read()).toBe(before.result);
  });
});
