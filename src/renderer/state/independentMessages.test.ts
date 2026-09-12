import { afterEach, describe, expect, it } from "vitest";
import { useAppStore } from "./appStore";
import { messageItemPayloadSchema } from "@/shared/contracts";

afterEach(() => useAppStore.setState({ threads: [], view: { kind: "home" } }));

describe("messages outside an execution turn", () => {
  it.each([true, undefined])(
    "preserves turn semantics for turnIndependent=%s",
    (turnIndependent) => {
      const store = useAppStore.getState();
      const thread = store.createThread({
        projectId: "project",
        agentKind: "example",
        config: { model: "example" },
        prompt: "hello",
        presentationMode: "gui",
      });
      store.updateThreadRuntime(thread.id, {
        status: "idle",
        attention: "none",
        canResumeWithConfig: true,
      });
      // The omitted-field case represents pre-upgrade persisted message payloads.
      const payload = messageItemPayloadSchema.parse(
        JSON.parse(
          JSON.stringify({
            content: [{ kind: "text", text: "Hello" }],
            ...(turnIndependent ? { turnIndependent } : {}),
          }),
        ),
      );
      store.applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: "message",
        itemType: "assistant_message",
        payload,
      });
      store.applyRuntimeEvent(thread.id, {
        type: "item.updated",
        threadId: thread.id,
        itemId: "message",
        payload: { content: [{ kind: "text", text: "Hello again" }] },
      });
      expect(useAppStore.getState().threads.find((t) => t.id === thread.id)?.status).toBe(
        turnIndependent ? "idle" : "working",
      );
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.message?.payload,
      ).toMatchObject({ content: [{ kind: "text", text: "Hello again" }] });
    },
  );
});
