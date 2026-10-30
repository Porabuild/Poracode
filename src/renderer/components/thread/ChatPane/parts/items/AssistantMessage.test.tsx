import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { AssistantMessage } from "./AssistantMessage";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("AssistantMessage", () => {
  it.each([false, true])(
    "reveals the first live burst progressively with a separate start event=%s, without replaying it on remount",
    (separateStart) => {
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      });
      vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
      const text = "First buffered paragraph. ".repeat(80);
      const item: RuntimeChatItem = {
        id: `first-burst-${separateStart}`,
        type: "assistant_message",
        state: "updated",
        streams: { assistant_text: text },
        observedLive: true,
      };
      const body = (value: RuntimeChatItem) => (
        <AppProvider>
          <AssistantMessage threadId="burst-thread" item={value} isTurnActive />
        </AppProvider>
      );
      let view = render(body(separateStart ? { ...item, state: "started", streams: {} } : item));
      try {
        if (separateStart) view.rerender(body(item));
        expect(view.container.textContent).toBe("");
        view.unmount();
        view = render(body(item));
        expect(view.container.textContent).toBe("");
        const pending = [...frames.values()];
        frames.clear();
        act(() => {
          for (const callback of pending) callback(1_000);
        });
        expect(view.container.textContent!.length).toBeGreaterThan(0);
        expect(view.container.textContent!.length).toBeLessThan(text.length);
        view.unmount();
        const reopened = render(body(item));
        try {
          expect(reopened.container.textContent).toBe(text);
        } finally {
          reopened.unmount();
        }
      } finally {
        view.unmount();
        vi.unstubAllGlobals();
      }
    },
  );

  it.each([
    { state: "completed", observedLive: true, isTurnActive: true },
    { state: "updated", observedLive: true, isTurnActive: false },
    { state: "updated", observedLive: false, isTurnActive: true },
  ] as const)("shows existing or settled text immediately: %j", ({ isTurnActive, ...item }) => {
    const text = "Existing paragraph. ".repeat(80);
    const view = render(
      <AppProvider>
        <AssistantMessage
          threadId="existing-thread"
          item={{
            ...item,
            id: JSON.stringify(item),
            type: "assistant_message",
            streams: { assistant_text: text },
          }}
          isTurnActive={isTurnActive}
        />
      </AppProvider>,
    );
    expect(view.container.textContent).toBe(text);
  });

  it.each([1, 2])(
    "keeps an interrupted native v%s reply unavailable even when its fence closed before completion",
    (version) => {
      const text = `\`\`\`poracode-visual-v${version} Interrupted\n{"blocks":[{"type":"outputs","items":[{"label":"Total","value":42}]}]}\n\`\`\``;
      const item: RuntimeChatItem = {
        id: "interrupted-native",
        type: "assistant_message",
        state: "updated",
        streams: { assistant_text: text },
      };
      const { container } = render(
        <AppProvider>
          <AssistantMessage threadId="native-thread" item={item} isTurnActive={false} />
        </AppProvider>,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Incomplete visual block. Showing source only.",
      );
      expect(container.querySelector("[data-poracode-native-visual]")).toBeNull();
      expect(container.querySelector("pre")?.textContent).toContain('"value":42');
    },
  );

  it.each([1, 2])(
    "renders native v%s data in the original assistant message without changing its text or payload",
    (version) => {
      const text = `Before\n\`\`\`poracode-visual-v${version} Answer\n{"blocks":[{"type":"outputs","items":[{"label":"Total","value":42}]}]}\n\`\`\`\nAfter`;
      const item: RuntimeChatItem = {
        id: "canonical-native-item",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: text },
        payload: { content: [{ kind: "text", text }] },
      };
      const before = structuredClone(item);
      const { container } = render(
        <AppProvider>
          <AssistantMessage threadId="native-thread" item={item} isTurnActive={false} />
        </AppProvider>,
      );
      expect(container.querySelectorAll("[data-poracode-native-visual]")).toHaveLength(1);
      expect(screen.getByText("Total")).toBeTruthy();
      expect(screen.getByText("42")).toBeTruthy();
      expect(screen.getByText("Before")).toBeTruthy();
      expect(screen.getByText("After")).toBeTruthy();
      expect(item).toEqual(before);
      expect(container.querySelector("iframe")).toBeNull();
    },
  );

  it("admits only six completed native documents and never admits retained/elided source", () => {
    const fence =
      '```poracode-visual-v1 Answer\n{"blocks":[{"type":"outputs","items":[{"label":"Total","value":42}]}]}\n```\n';
    const item: RuntimeChatItem = {
      id: "bounded-native-item",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: fence.repeat(7) },
    };
    const { container, rerender } = render(
      <AppProvider>
        <AssistantMessage threadId="native-thread" item={item} isTurnActive={false} />
      </AppProvider>,
    );
    expect(container.querySelectorAll("[data-poracode-native-visual]")).toHaveLength(6);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Too many visuals in this message. Showing source only.",
    );
    rerender(
      <AppProvider>
        <AssistantMessage
          threadId="native-thread"
          item={{
            ...item,
            streams: {
              assistant_text: `${fence}[... poracode elided 900000 characters of earlier output ...]`,
            },
          }}
          isTurnActive={false}
        />
      </AppProvider>,
    );
    expect(container.querySelector("[data-poracode-native-visual]")).toBeNull();
  });

  it("keeps titled HTML source in its assistant row without mounting author markup", () => {
    const text =
      "Comparison\n```poracode-html-v1 Plan calculator\n<div id='untrusted'>42</div>\n```\nChoose a plan.";
    const item: RuntimeChatItem = {
      id: "visual-reply",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: text },
    };
    const { container } = render(
      <AppProvider>
        <AssistantMessage threadId="t1" item={item} isTurnActive={false} />
      </AppProvider>,
    );
    expect(screen.getByTitle("Plan calculator")).toHaveTextContent("Plan calculator");
    expect(container.querySelector("pre")?.textContent).toBe("<div id='untrusted'>42</div>\n");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("#untrusted")).toBeNull();
    expect(screen.getByText("Comparison")).toBeTruthy();
    expect(screen.getByText("Choose a plan.")).toBeTruthy();
  });

  it("retains bounded prose navigation beside a visual", () => {
    const text = `${"entry ".repeat(20000)}\n\`\`\`poracode-html-v1 Chart\n<h1>42</h1>\n\`\`\``;
    const item: RuntimeChatItem = {
      id: "long-visual",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: text },
    };
    const { container } = render(
      <AppProvider>
        <AssistantMessage threadId="long-t1" item={item} isTurnActive={false} />
      </AppProvider>,
    );
    expect(screen.getByTitle("Chart")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeTruthy();
    expect(container.textContent!.length).toBeLessThan(text.length);
  });

  it("never executes an HTML document whose persisted stream has an elided gap", () => {
    const text =
      "```poracode-html-v1 Incomplete chart\n<h1>Prefix</h1>\n[... poracode elided 900000 characters of earlier output ...]\n<script>tail()</script>\n```";
    const item: RuntimeChatItem = {
      id: "elided-visual",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: text },
    };
    const { container } = render(
      <AppProvider>
        <AssistantMessage threadId="elided-t1" item={item} isTurnActive={false} />
      </AppProvider>,
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it.each([false, true])(
    "settles visual availability after streaming (closed fence=%s)",
    (closed) => {
      const text = `\`\`\`poracode-html-v1 Chart\n<h1>42</h1>\n${closed ? "```" : ""}`;
      const item: RuntimeChatItem = {
        id: "unfinished-visual",
        type: "assistant_message",
        state: "updated",
        streams: { assistant_text: text },
      };
      const { container, rerender } = render(
        <AppProvider>
          <AssistantMessage threadId="unfinished-t1" item={item} isTurnActive />
        </AppProvider>,
      );
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Receiving HTML source…");
      rerender(
        <AppProvider>
          <AssistantMessage
            threadId="unfinished-t1"
            item={{ ...item, state: "completed" }}
            isTurnActive={false}
          />
        </AppProvider>,
      );
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(
        closed
          ? "Interactive rendering is unavailable. Showing source only."
          : "Incomplete HTML block. Showing source only.",
      );
      expect(screen.queryByText("Receiving HTML source…")).toBeNull();
    },
  );

  it("renders embedded image content blocks inline alongside text", () => {
    const item: RuntimeChatItem = {
      id: "asst_1",
      type: "assistant_message",
      state: "completed",
      payload: {
        content: [
          { kind: "text", text: "Here is your image:" },
          {
            kind: "image",
            mimeType: "image/png",
            dataUrl: `data:image/png;base64,${PNG_BASE64}`,
            name: "result",
          },
        ],
      },
      streams: {},
    };

    render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={item} isTurnActive={false} />
      </AppProvider>,
    );

    const img = screen.getByAltText("result") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(screen.getByText("Here is your image:")).toBeTruthy();
  });

  it("ignores non-image content blocks", () => {
    const item: RuntimeChatItem = {
      id: "asst_2",
      type: "assistant_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Just text." }] },
      streams: {},
    };

    render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={item} isTurnActive={false} />
      </AppProvider>,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Just text.")).toBeTruthy();
  });

  it("shows the live stream while active and the authoritative payload once completed", () => {
    const streamingItem: RuntimeChatItem = {
      id: "asst_display",
      type: "assistant_message",
      state: "updated",
      payload: {
        content: [{ kind: "text", text: "Hello" }],
        displayAuthoritative: true,
      },
      streams: { assistant_text: "Bonjour" },
    };

    const { rerender } = render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={streamingItem} isTurnActive={true} />
      </AppProvider>,
    );

    expect(screen.getByText("Bonjour")).toBeTruthy();
    expect(screen.queryByText("Hello")).toBeNull();

    rerender(
      <AppProvider>
        <AssistantMessage
          threadId="thread-1"
          item={{ ...streamingItem, state: "completed" }}
          isTurnActive={true}
        />
      </AppProvider>,
    );

    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByText("Bonjour")).toBeNull();
  });

  it("falls back to stream text when a completed item has no text payload", () => {
    const item: RuntimeChatItem = {
      id: "asst_stream_only",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: "Stream-only response" },
    };

    render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={item} isTurnActive={false} />
      </AppProvider>,
    );

    expect(screen.getByText("Stream-only response")).toBeTruthy();
  });

  it("honors an empty authoritative text payload after completion", () => {
    const item: RuntimeChatItem = {
      id: "asst_empty_display",
      type: "assistant_message",
      state: "completed",
      payload: {
        content: [{ kind: "text", text: "" }],
        displayAuthoritative: true,
      },
      streams: { assistant_text: "Suppressed original" },
    };

    render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={item} isTurnActive={false} />
      </AppProvider>,
    );

    expect(screen.queryByText("Suppressed original")).toBeNull();
  });

  it("keeps the full stream when a completed payload is not marked authoritative", () => {
    // Stream-first providers (e.g. Codex after an interrupted turn) can
    // complete with a payload holding less text than what already streamed;
    // without the authoritative flag the stream must win.
    const item: RuntimeChatItem = {
      id: "asst_interrupted",
      type: "assistant_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Partial" }] },
      streams: { assistant_text: "Partial plus the rest the user watched stream in" },
    };

    render(
      <AppProvider>
        <AssistantMessage threadId="thread-1" item={item} isTurnActive={false} />
      </AppProvider>,
    );

    expect(screen.getByText("Partial plus the rest the user watched stream in")).toBeTruthy();
    expect(screen.queryByText("Partial")).toBeNull();
  });

  describe("copy action gating", () => {
    const answer: RuntimeChatItem = {
      id: "asst_answer",
      type: "assistant_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "All done." }] },
      streams: {},
    };

    function seed(items: RuntimeChatItem[]) {
      useAppStore.setState({
        runtimeItemIdsByThread: { "thread-1": items.map((entry) => entry.id) },
        runtimeItemsByIdByThread: {
          "thread-1": Object.fromEntries(items.map((entry) => [entry.id, entry])),
        },
      });
    }

    beforeEach(() => {
      useAppStore.setState({
        threads: [],
        runtimeItemIdsByThread: {},
        runtimeItemsByIdByThread: {},
        runtimeCompletedTurnsByThread: {},
      });
    });

    it("shows the copy action when the message is the turn's last item", () => {
      seed([answer]);
      render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
        </AppProvider>,
      );
      expect(screen.getByLabelText("Copy message")).toBeTruthy();
    });

    it("shows the recorded completion timestamp beside the answer actions", () => {
      seed([answer]);
      useAppStore.setState({
        threads: [{ id: "thread-1", status: "idle", presentationMode: "gui" } as Thread],
      });
      const endedAt = new Date(2026, 9, 23, 9, 5).getTime();
      useAppStore
        .getState()
        .hydrateThreadCompletedTurns("thread-1", [
          { startedAt: endedAt - 1000, endedAt, anchorItemId: answer.id },
        ]);
      const { container } = render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
        </AppProvider>,
      );
      const timestamp = container.querySelector("time");
      expect(timestamp).toHaveAttribute("datetime", new Date(endedAt).toISOString());
      expect(timestamp?.closest(".poracode-message-action-strip")).toContainElement(
        screen.getByLabelText("Copy message"),
      );
      expect(timestamp).toHaveAttribute("title");
      expect(timestamp?.closest(".poracode-message-action-strip")).not.toHaveClass(
        "[@media(hover:hover)]:opacity-0",
      );
      expect(screen.getByLabelText("Fork from here").parentElement).not.toHaveClass(
        "[@media(hover:hover)]:opacity-0",
      );
    });

    it("keeps the latest finished answer visible until the next answer finishes, including short turns", () => {
      const nextAnswer: RuntimeChatItem = { ...answer, id: "asst_next", state: "updated" };
      const prompt: RuntimeChatItem = {
        id: "user_2",
        type: "user_message",
        state: "completed",
        payload: {},
        streams: {},
      };
      seed([answer, prompt, nextAnswer]);
      const firstTurn = { startedAt: 1000, endedAt: 2000, anchorItemId: answer.id };
      useAppStore.getState().hydrateThreadCompletedTurns("thread-1", [firstTurn]);
      const { container, rerender } = render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive />
          <AssistantMessage threadId="thread-1" item={nextAnswer} isTurnActive />
        </AppProvider>,
      );
      const strips = container.querySelectorAll(".poracode-message-action-strip");
      expect(strips[0]).not.toHaveClass("[@media(hover:hover)]:opacity-0");
      expect(strips[1]).toHaveClass("[@media(hover:hover)]:opacity-0");
      expect(strips[1]?.querySelector("time")).toBeNull();

      const finishedAnswer = { ...nextAnswer, state: "completed" as const };
      act(() => {
        seed([answer, prompt, finishedAnswer]);
        useAppStore
          .getState()
          .hydrateThreadCompletedTurns("thread-1", [
            firstTurn,
            { startedAt: 3000, endedAt: 3500, anchorItemId: nextAnswer.id },
          ]);
      });
      rerender(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
          <AssistantMessage threadId="thread-1" item={finishedAnswer} isTurnActive={false} />
        </AppProvider>,
      );
      expect(strips[0]).toHaveClass("[@media(hover:hover)]:opacity-0");
      expect(strips[1]).not.toHaveClass("[@media(hover:hover)]:opacity-0");
      expect(strips[1]?.querySelector("time")).toHaveAttribute(
        "datetime",
        new Date(3500).toISOString(),
      );
    });

    it.each([null, "tool_tail"])(
      "keeps the latest finished answer visible after a turn without an answer (anchor=%s)",
      (anchorItemId) => {
        seed([
          answer,
          { id: "user_2", type: "user_message", state: "completed", payload: {}, streams: {} },
          {
            id: "tool_tail",
            type: "tool_call",
            state: "completed",
            payload: { name: "test" },
            streams: {},
          },
        ]);
        useAppStore.getState().hydrateThreadCompletedTurns("thread-1", [
          { startedAt: 1000, endedAt: 2000, anchorItemId: answer.id },
          { startedAt: 3000, endedAt: 4000, anchorItemId },
        ]);
        const { container } = render(
          <AppProvider>
            <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
          </AppProvider>,
        );
        expect(container.querySelector(".poracode-message-action-strip")).not.toHaveClass(
          "[@media(hover:hover)]:opacity-0",
        );
      },
    );

    it("shows the copy action when the next top-level item is the next user message", () => {
      seed([
        answer,
        { id: "user_2", type: "user_message", state: "completed", payload: {}, streams: {} },
      ]);
      render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={true} />
        </AppProvider>,
      );
      expect(screen.getByLabelText("Copy message")).toBeTruthy();
    });

    it("hides the copy action when tool calls follow the message in the same turn", () => {
      seed([
        answer,
        { id: "tool_1", type: "tool_call", state: "completed", payload: {}, streams: {} },
      ]);
      render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
        </AppProvider>,
      );
      expect(screen.queryByLabelText("Copy message")).toBeNull();
    });

    it("ignores nested sub-agent items when locating the turn's last item", () => {
      seed([
        answer,
        {
          id: "child_1",
          type: "tool_call",
          state: "completed",
          payload: {},
          streams: {},
          parentItemId: "tool_parent",
        },
      ]);
      render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
        </AppProvider>,
      );
      expect(screen.getByLabelText("Copy message")).toBeTruthy();
    });

    it("reserves the copy strip without exposing its action while the turn is active", () => {
      seed([answer]);
      const { container, rerender } = render(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={true} />
        </AppProvider>,
      );
      expect(screen.queryByLabelText("Copy message")).toBeNull();
      const reservedStrip = container.querySelector(".poracode-message-action-strip");
      expect(reservedStrip).not.toBeNull();

      rerender(
        <AppProvider>
          <AssistantMessage threadId="thread-1" item={answer} isTurnActive={false} />
        </AppProvider>,
      );

      expect(screen.getByLabelText("Copy message")).toBeTruthy();
      expect(container.querySelector(".poracode-message-action-strip")).toBe(reservedStrip);
    });
  });
});
