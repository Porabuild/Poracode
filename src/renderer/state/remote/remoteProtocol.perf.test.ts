import { describe, expect, it } from "vitest";
import { collectRuntimeEventsFromSupervisoryMessage } from "./runtimeRequests";
import { applyRuntimeEventBatchesToState } from "@/renderer/state/slices/runtimeEventReducer";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import type { RuntimeEvent } from "@/shared/contracts";
import { RemoteDesktopClient } from "@/shared/remote/client";

const THREAD_COUNT = 6;

function deltasPerThread(): number {
  const scale = Math.max(1, Math.min(10, Number(process.env.PORACODE_PERF_SCALE ?? "1") || 1));
  return 1000 * scale;
}

function emptyRuntimeState(): AppStoreState {
  return {
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeOpenTurnByThread: {},
  } as unknown as AppStoreState;
}

describe("canonical browser protocol data flow", () => {
  it("keeps WebSocket parsing, runtime validation, and batched store reduction responsive", () => {
    const client = new RemoteDesktopClient("https://desktop.example.test");
    const deltaCount = deltasPerThread();
    const frames: string[] = [];
    let seq = 0;
    for (let threadIndex = 0; threadIndex < THREAD_COUNT; threadIndex += 1) {
      const threadId = `perf-thread-${threadIndex}`;
      const itemId = `assistant-${threadIndex}`;
      frames.push(
        JSON.stringify({
          type: "event",
          seq: ++seq,
          event: {
            type: "thread-runtime-event",
            threadId,
            event: {
              type: "item.started",
              threadId,
              itemId,
              itemType: "assistant_message",
              payload: { content: [{ kind: "text", text: "" }] },
            },
          },
        }),
      );
      for (let deltaIndex = 0; deltaIndex < deltaCount; deltaIndex += 1) {
        frames.push(
          JSON.stringify({
            type: "event",
            seq: ++seq,
            event: {
              type: "thread-runtime-event",
              threadId,
              event: {
                type: "content.delta",
                threadId,
                itemId,
                stream: "assistant_text",
                delta: "token ",
              },
            },
          }),
        );
      }
    }

    const batches = new Map<string, RuntimeEvent[]>();
    const startedAt = performance.now();
    for (const frame of frames) {
      const message = client.parseSocketMessage(frame);
      if (message.type !== "event") continue;
      for (const batch of collectRuntimeEventsFromSupervisoryMessage(message.event)) {
        const events = batches.get(batch.threadId) ?? [];
        events.push(...batch.events);
        batches.set(batch.threadId, events);
      }
    }
    const patch = applyRuntimeEventBatchesToState(
      emptyRuntimeState(),
      [...batches].map(([threadId, events]) => ({ threadId, events })),
    );
    const wallMs = performance.now() - startedAt;

    for (let index = 0; index < THREAD_COUNT; index += 1) {
      expect(patch.runtimeItemIdsByThread?.[`perf-thread-${index}`]).toHaveLength(1);
    }
    expect(wallMs).toBeLessThan(Math.max(5000, frames.length));

    if (process.env.PORACODE_PERF_LOG) {
      console.log(
        `[perf/browser] threads=${THREAD_COUNT} frames=${frames.length} wallMs=${wallMs.toFixed(1)} avgMs=${(wallMs / frames.length).toFixed(4)}`,
      );
    }
  });
});
