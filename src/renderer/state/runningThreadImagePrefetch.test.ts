import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteImageRefValue } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  RUNNING_THREAD_IMAGE_PREFETCH_LIMIT,
  newestThreadImageRefs,
  startThreadImagePrefetch,
} from "./runningThreadImagePrefetch";

const mocks = vi.hoisted(() => ({
  requestRef:
    vi.fn<(ref: RemoteImageRefValue, priority?: string, variant?: string, rank?: number) => void>(),
}));

vi.mock("@/renderer/components/thread/threadImageAuthority", () => ({
  resolveThreadImageAuthority: () => ({
    readiness: {
      resolveRef: () => "",
      requestRef: mocks.requestRef,
    },
  }),
}));

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  agentKind: "claude",
  config: { model: "claude-haiku-4-5" },
  title: "Shots",
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T00:00:00.000Z",
};

const ref = (itemId: string, bytes = 300_000): RemoteImageRefValue => ({
  threadId: thread.id,
  itemId,
  path: ["images", 0],
  mime: "image/jpeg",
  bytes,
  width: 1440,
  height: 900,
});

const toolItem = (
  id: string,
  imageRef: RemoteImageRefValue,
  status = "success",
): RuntimeChatItem => ({
  id,
  type: "dynamic_tool_call",
  state: "completed",
  payload: { name: "imageGeneration", status, images: [{ __poracodeImageRef: imageRef }] },
  streams: {},
});

const assistantItem = (id: string, imageRefs: RemoteImageRefValue[]): RuntimeChatItem => ({
  id,
  type: "assistant_message",
  state: "completed",
  payload: {
    content: imageRefs.map((imageRef) => ({
      kind: "image",
      dataUrl: { __poracodeImageRef: imageRef },
    })),
  },
  streams: {},
});

function seed(items: readonly RuntimeChatItem[], structuralVersion = 1) {
  useAppStore.setState({
    threads: [thread],
    runtimeItemIdsByThread: { [thread.id]: items.map((item) => item.id) },
    runtimeItemsByIdByThread: {
      [thread.id]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
    runtimeStructuralVersionByThread: { [thread.id]: structuralVersion },
  } as never);
}

beforeEach(() => {
  mocks.requestRef.mockClear();
  useAppStore.setState({
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeStructuralVersionByThread: {},
  } as never);
});

describe("newestThreadImageRefs", () => {
  it("picks the newest refs newest-first across tool rows and assistant blocks", () => {
    const items = [
      toolItem("errored", ref("errored"), "error"),
      toolItem("tool-1", ref("tool-1")),
      assistantItem("assistant", [ref("block-old"), ref("block-new")]),
      toolItem("inline", ref("inline")),
      toolItem("tool-4", ref("tool-4")),
      toolItem("tool-5", ref("tool-5")),
    ];
    // Make the inline row carry an inline data URL only.
    items[3] = {
      ...items[3]!,
      payload: {
        name: "imageGeneration",
        status: "success",
        images: ["data:image/png;base64,AAAA"],
      },
    };
    const refs = newestThreadImageRefs(
      items.map((item) => item.id),
      Object.fromEntries(items.map((item) => [item.id, item])),
      () => "",
      RUNNING_THREAD_IMAGE_PREFETCH_LIMIT,
    );
    expect(refs.map((entry) => entry.ref.itemId)).toEqual([
      "tool-5",
      "tool-4",
      "block-new",
      "block-old",
    ]);
    expect(refs.map((entry) => entry.rank)).toEqual([5, 4, 2, 2]);
  });

  it("skips child rows and rows the transcript never paints", () => {
    const visible = toolItem("visible", ref("visible"));
    const child: RuntimeChatItem = {
      ...toolItem("child-image", ref("child-image")),
      type: "image_view",
      parentItemId: "parent",
    };
    const plan: RuntimeChatItem = {
      id: "plan",
      type: "plan",
      state: "completed",
      payload: { status: "success", images: [{ __poracodeImageRef: ref("plan-image") }] },
      streams: {},
    };
    const refs = newestThreadImageRefs(
      ["visible", child.id, plan.id],
      { visible, [child.id]: child, [plan.id]: plan },
      () => "",
    );
    expect(refs.map((entry) => entry.ref.itemId)).toEqual(["visible"]);
  });
});

describe("startThreadImagePrefetch", () => {
  it("requests prefetch-card refs, reacts to structural updates, ignores text deltas, and stops", () => {
    const first = toolItem("first", ref("first", 300_000));
    const small = toolItem("small", ref("small", 100_000));
    seed([first, small]);
    const stop = startThreadImagePrefetch(thread.id);
    expect(mocks.requestRef).toHaveBeenCalledTimes(2);
    expect(mocks.requestRef.mock.calls.map((call) => call.slice(1))).toEqual([
      ["prefetch", undefined, 1],
      ["prefetch", "card", 0],
    ]);

    const newer = toolItem("newer", ref("newer"));
    seed([first, small, newer], 2);
    expect(mocks.requestRef).toHaveBeenCalledTimes(5);
    expect(mocks.requestRef.mock.calls[2]![0].itemId).toBe("newer");

    // Pure stream delta: no structural version bump, no new prefetch.
    const state = useAppStore.getState();
    useAppStore.setState({
      runtimeItemsByIdByThread: {
        ...state.runtimeItemsByIdByThread,
        [thread.id]: {
          ...state.runtimeItemsByIdByThread[thread.id],
          newer: { ...newer, streams: { assistant_text: "more text" } },
        },
      },
    } as never);
    expect(mocks.requestRef).toHaveBeenCalledTimes(5);

    stop();
    seed([first, small, newer], 3);
    expect(mocks.requestRef).toHaveBeenCalledTimes(5);
  });
});
