import type { Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import type { RemoteBoundedThreadHistoryResult } from "@/shared/remote/client";
import { HEAD_CHARS, TAIL_CHARS, elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";
import { useAppStore } from "../appStore";
import { remoteThreadId } from "../remoteProjection";
import { recordRemoteThreadAppliedSeq } from "../remoteServers/eventSocketRegistry";

export const connection = "capped-history-host";
export const thread: Thread = {
  id: "thread",
  projectId: "project",
  title: "History fixture",
  agentKind: "fixture-agent",
  config: { model: "default" },
  status: "working",
  presentationMode: "gui",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
export const viewThread = remoteThreadId(connection, thread.id);
export type CappedCase = "ordinary" | "unicode";

export function canonicalText(kind: CappedCase): string {
  return kind === "ordinary"
    ? `${"A".repeat(HEAD_CHARS)}\n${elisionNotice(256_000)}\n${"b".repeat(TAIL_CHARS + 1 - 256_000)}c`
    : `${"A".repeat(255_999)}😀${"b".repeat(4_000_000)}`;
}

/** Real reducer/store retention, with the surrogate pair in one small delta. */
export function seedCappedLiveItem(kind: CappedCase): void {
  useAppStore.setState({ threads: [{ ...thread, id: viewThread, remoteServerId: connection }] });
  const state = useAppStore.getState();
  state.applyRuntimeEvent(viewThread, {
    type: "item.started",
    threadId: viewThread,
    itemId: "assistant",
    itemType: "assistant_message",
    payload: { stable: true },
  });
  const append = (delta: string) =>
    state.applyRuntimeEvent(viewThread, {
      type: "content.delta",
      threadId: viewThread,
      itemId: "assistant",
      stream: "assistant_text",
      delta,
    });
  append("A".repeat(kind === "unicode" ? HEAD_CHARS - 1 : HEAD_CHARS));
  if (kind === "unicode") append("😀");
  const tailSize = TAIL_CHARS + (kind === "ordinary" ? 1 : 0);
  for (let offset = 0; offset < tailSize; offset += 256_000) {
    append("b".repeat(Math.min(256_000, tailSize - offset)));
  }
  recordRemoteThreadAppliedSeq(connection, thread.id, 100);
}

export function historyResult(
  kind: CappedCase,
  state: "updated" | "completed" = "updated",
  negotiation: "bounded" | "legacy" = "bounded",
): RemoteBoundedThreadHistoryResult {
  const page: RemoteThreadSnapshot = {
    thread,
    snapshotSeq: 110,
    runtimeItems: [
      {
        id: "assistant",
        type: "assistant_message",
        state,
        payload: { stable: true },
        streams: { assistant_text: canonicalText(kind) },
      },
    ],
    runtimeNextCursor: 100,
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  };
  return negotiation === "bounded"
    ? { negotiation, page: { ...page, reads: "bounded-v1", completedTurnsNextCursor: null } }
    : { negotiation, page };
}

export function liveItem() {
  return useAppStore.getState().runtimeItemsByIdByThread[viewThread]!.assistant!;
}

export function deltaFrame(delta: string) {
  return {
    type: "thread-runtime-event" as const,
    threadId: thread.id,
    event: {
      type: "content.delta" as const,
      threadId: thread.id,
      itemId: "assistant",
      stream: "assistant_text" as const,
      delta,
    },
  };
}
