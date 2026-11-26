import type { WireLab } from "./wireLab.ts";
import { FIXTURE_THREAD_ID, buildRuntimeEvent } from "./labFixtures.ts";
import { TRANSCRIPT_PREVIEW_IMAGE } from "../fixtures/tool-taxonomy/media-assets.ts";

export const DELEGATED_WATCH_SUBAGENT_ID = "fixture-subagent-live";
export const DELEGATED_WATCH_CROSSAGENT_ID = "fixture-crossagent-live";
export const DELEGATED_WATCH_SUBAGENT_CHILD_ID = "fixture-subagent-live-image";
export const DELEGATED_WATCH_CROSSAGENT_CHILD_ID = "fixture-crossagent-live-image";

export function prepareDelegatedWatchItems(
  thread: Record<string, unknown>,
): Array<Record<string, unknown>> {
  thread.status = "working";
  thread.attention = "none";
  delete thread.activeTurnStartedAt;
  return [
    {
      id: "item-fixture-delegated-watch-root",
      type: "assistant_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Delegated watch ready." }] },
      streams: {},
    },
    {
      id: DELEGATED_WATCH_SUBAGENT_ID,
      type: "tool_call",
      state: "started",
      payload: {
        name: "Task",
        status: "running",
        isSubAgent: true,
        args: { description: "Live Subagent image" },
      },
      streams: {},
    },
    {
      id: DELEGATED_WATCH_CROSSAGENT_ID,
      type: "tool_call",
      state: "started",
      payload: {
        name: "Crossagent",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
        args: { description: "Live Crossagent image" },
      },
      streams: {},
    },
  ];
}

/** Active delegated rows whose child PNG arrives only on the canonical subscribe. */
const delegatedWatchEmissions = new WeakMap<WireLab, Set<string>>();

export function installDelegatedWatchFixture(lab: WireLab): void {
  const emitted = new Set<string>();
  delegatedWatchEmissions.set(lab, emitted);
  lab.routes.prepareRuntimeImage(DELEGATED_WATCH_SUBAGENT_CHILD_ID);
  lab.routes.prepareRuntimeImage(DELEGATED_WATCH_CROSSAGENT_CHILD_ID);
  const workspace = lab.workspace as typeof lab.workspace & {
    __delegatedWatchInstalled?: boolean;
  };
  if (workspace.__delegatedWatchInstalled) return;
  workspace.__delegatedWatchInstalled = true;
  const originalInvoke = workspace.invoke.bind(workspace);
  const emitChild = (parentItemId: string, itemId: string) => {
    const current = delegatedWatchEmissions.get(lab);
    if (!current || current.has(parentItemId)) return;
    current.add(parentItemId);
    const payload = {
      name: "screenshot",
      status: "success",
      result: {
        content: [
          {
            type: "image",
            mimeType: "image/png",
            data: {
              __poracodeImageRef: {
                threadId: FIXTURE_THREAD_ID,
                itemId,
                path: ["result", "content", 0, "data"],
                mime: "image/png",
                bytes: Buffer.from(TRANSCRIPT_PREVIEW_IMAGE.base64, "base64").byteLength,
                width: TRANSCRIPT_PREVIEW_IMAGE.width,
                height: TRANSCRIPT_PREVIEW_IMAGE.height,
              },
            },
          },
        ],
      },
    };
    for (const type of ["item.started", "item.completed"] as const) {
      lab.emit({
        kind: "runtime",
        threadId: FIXTURE_THREAD_ID,
        runtimeEvent: {
          ...buildRuntimeEvent(type),
          itemId,
          itemType: "tool_call",
          parentItemId,
          payload,
        },
      });
    }
  };
  workspace.invoke = (name, payload) => {
    const body = payload as { parentItemId?: string };
    const watched =
      body.parentItemId === DELEGATED_WATCH_SUBAGENT_ID ||
      body.parentItemId === DELEGATED_WATCH_CROSSAGENT_ID;
    if (name === "subagentSubscribe" && watched) {
      if (body.parentItemId === DELEGATED_WATCH_SUBAGENT_ID) {
        emitChild(DELEGATED_WATCH_SUBAGENT_ID, DELEGATED_WATCH_SUBAGENT_CHILD_ID);
      } else if (body.parentItemId === DELEGATED_WATCH_CROSSAGENT_ID) {
        emitChild(DELEGATED_WATCH_CROSSAGENT_ID, DELEGATED_WATCH_CROSSAGENT_CHILD_ID);
      }
      return { history: [], leaseMs: 90_000 };
    }
    if (name === "subagentUnsubscribe" && watched) return undefined;
    return originalInvoke(name, payload);
  };
}
