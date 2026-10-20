import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { AppProvider } from "@/renderer/components/ui/provider";
import {
  performThreadInputSubmit,
  submitThreadInput,
} from "@/renderer/actions/threadRuntimeActions";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { MessageReplyForm, SendThreadInputPayload, Thread } from "@/shared/contracts";
import { isVisibleRuntimeItem } from "../../chatPaneSelectors";
import { AssistantMessage } from "./AssistantMessage";
import { ChatItemRow } from "./ChatItemRow";
import { ThreadMessageReplyDocks } from "../../../ThreadMessageReplyPanel";

vi.mock("@/renderer/actions/threadRuntimeActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/threadRuntimeActions")>()),
  submitThreadInput: vi.fn<typeof submitThreadInput>(),
}));
vi.mock("@/renderer/analytics/posthog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/analytics/posthog")>()),
  captureThreadPromptSubmitted: vi.fn<() => void>(),
}));

const thread: Thread = {
  id: "reply-thread",
  projectId: "project",
  title: "Reply",
  agentKind: "claude",
  config: { model: "test-model" },
  status: "working",
  attention: "working",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
};
const form: MessageReplyForm = {
  questions: [
    {
      id: "scope",
      question: "Which scope?",
      options: [
        { optionId: "A", label: "A" },
        { optionId: "B", label: "B" },
      ],
    },
  ],
};
function message(replyForm = form): RuntimeChatItem {
  return {
    id: "question",
    type: "assistant_message",
    state: "completed",
    payload: { content: [{ kind: "text", text: "Which scope?\n- A\n- B" }], replyForm },
    streams: {},
  };
}
function seed(items: RuntimeChatItem[]) {
  useAppStore.setState({
    threads: [thread],
    runtimeItemIdsByThread: { [thread.id]: items.map((item) => item.id) },
    runtimeItemsByIdByThread: {
      [thread.id]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
    runtimeRequestsByThread: {},
  });
}
function show(item = message()) {
  seed([item]);
  return render(
    <AppProvider>
      <AssistantMessage threadId={thread.id} item={item} isTurnActive />
      <ThreadMessageReplyDocks threadId={thread.id} />
    </AppProvider>,
  );
}

describe("non-blocking message reply forms", () => {
  beforeEach(() => {
    vi.mocked(submitThreadInput).mockReset().mockResolvedValue(undefined);
  });

  it("renders selectable choices while work continues, gates blank submit, and sends a normal reply", async () => {
    const { container } = show();
    expect(
      container.querySelector('[data-placement="composer"] [data-message-reply-form]'),
    ).not.toBeNull();
    expect(screen.getAllByText("Which scope?")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.submit(screen.getByRole("option", { name: /A/ }).closest("form")!);
    expect(submitThreadInput).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: /A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(submitThreadInput).toHaveBeenCalledExactlyOnceWith(
        thread.id,
        "Which scope?\nA",
        undefined,
        {
          questionAnswer: {
            questions: [{ header: "", question: "Which scope?", selected: [{ label: "A" }] }],
          },
        },
      ),
    );
    expect(useAppStore.getState().threads[0]?.status).toBe("working");
    expect(useAppStore.getState().runtimeRequestsByThread).toEqual({});
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("collects multiple answers, including free text, before sending", async () => {
    show(
      message({
        questions: [...form.questions, { id: "detail", question: "Details?", options: null }],
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: /B/ }));
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  custom detail  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(submitThreadInput).toHaveBeenCalledExactlyOnceWith(
        thread.id,
        "Which scope?\nB\n\nDetails?\ncustom detail",
        undefined,
        { questionAnswer: expect.any(Object) },
      ),
    );
  });

  it("submits a custom answer with Enter and prevents a second in-flight send", async () => {
    let complete!: () => void;
    vi.mocked(submitThreadInput).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    show();
    const input = screen.getByPlaceholderText("Or write a custom answer");
    fireEvent.change(input, { target: { value: "  another scope  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);
    expect(submitThreadInput).toHaveBeenCalledExactlyOnceWith(
      thread.id,
      "Which scope?\nanother scope",
      undefined,
      { questionAnswer: expect.any(Object) },
    );
    await act(async () => complete());
  });

  it.each([false, true])(
    "uses the option activated with Enter, without a stale choice (previous: %s)",
    async (previous) => {
      show();
      if (previous) fireEvent.click(screen.getByRole("option", { name: /A/ }));
      fireEvent.keyDown(screen.getByRole("option", { name: /B/ }), { key: "Enter" });
      await waitFor(() =>
        expect(submitThreadInput).toHaveBeenCalledExactlyOnceWith(
          thread.id,
          "Which scope?\nB",
          undefined,
          { questionAnswer: expect.any(Object) },
        ),
      );
    },
  );

  it("keeps assistant context visible and uses question text for accessible names", () => {
    const item = message();
    item.payload = {
      ...(item.payload as object),
      content: [{ kind: "text", text: "The repository requires a scope choice." }],
    };
    show(item);
    expect(screen.getByText("The repository requires a scope choice.")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Which scope?" })).toBeTruthy();
    expect(screen.queryByText("scope")).toBeNull();
  });

  it("keeps child-agent questions as text instead of replying to the root thread", () => {
    show({ ...message(), parentItemId: "child-tool" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText(/Which scope\?/)).toBeTruthy();
  });

  it("keeps the answer available for retry after a definite send failure", async () => {
    const notify = vi.spyOn(toast, "danger").mockImplementation(() => "toast");
    vi.mocked(submitThreadInput).mockRejectedValueOnce(new Error("Disconnected"));
    show();
    fireEvent.click(screen.getByRole("option", { name: /A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(submitThreadInput).toHaveBeenCalledTimes(2));
    notify.mockRestore();
  });

  it("does not retire a form for a real failed optimistic input, including after remount", async () => {
    const item = message();
    const view = show(item);
    await act(async () => {
      await expect(
        performThreadInputSubmit({
          thread,
          prompt: "A",
          transport: {
            sendThreadInput: async () => {
              throw new Error("Disconnected");
            },
          },
        }),
      ).rejects.toThrow("Disconnected");
    });
    expect(screen.getByRole("listbox")).toBeTruthy();
    view.unmount();
    render(
      <AppProvider>
        <AssistantMessage threadId={thread.id} item={item} isTurnActive />
        <ThreadMessageReplyDocks threadId={thread.id} />
      </AppProvider>,
    );
    expect(screen.getByRole("listbox")).toBeTruthy();
    await act(async () => {
      await performThreadInputSubmit({
        thread,
        prompt: "A",
        transport: { sendThreadInput: async () => {} },
      });
    });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ignores a rejected reply's late canonical echo after backpressure recovery", async () => {
    const item = message();
    const view = show(item);
    let userMessageItemId = "";
    await act(async () => {
      await expect(
        performThreadInputSubmit({
          thread,
          prompt: "A",
          transport: {
            sendThreadInput: async (input) => {
              userMessageItemId = input.userMessageItemId!;
              throw new Error("Disconnected");
            },
          },
        }),
      ).rejects.toThrow("Disconnected");
    });
    act(() => {
      useAppStore.getState().applyRuntimeEvent(thread.id, {
        type: "item.started",
        threadId: thread.id,
        itemId: userMessageItemId,
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "A" }] },
      });
    });
    view.unmount();
    render(
      <AppProvider>
        <AssistantMessage threadId={thread.id} item={item} isTurnActive />
        <ThreadMessageReplyDocks threadId={thread.id} />
      </AppProvider>,
    );
    expect((screen.getByRole("option", { name: /A/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides replies across remount while delivery is pending, then allows retry after failure", async () => {
    const item = message();
    const view = show(item);
    let rejectSend!: (error: Error) => void;
    let delivery!: Promise<unknown>;
    await act(async () => {
      delivery = performThreadInputSubmit({
        thread,
        prompt: "A",
        transport: {
          sendThreadInput: () =>
            new Promise<void>((_resolve, reject) => {
              rejectSend = reject;
            }),
        },
      }).catch((error: unknown) => error);
    });
    view.unmount();
    render(
      <AppProvider>
        <AssistantMessage threadId={thread.id} item={item} isTurnActive />
        <ThreadMessageReplyDocks threadId={thread.id} />
      </AppProvider>,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(submitThreadInput).not.toHaveBeenCalled();
    await act(async () => {
      rejectSend(new Error("Disconnected"));
      await delivery;
    });
    expect((screen.getByRole("option", { name: /A/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["accepted", "failed"])(
    "shows the answer before a delayed send settles as %s and preserves retry choices",
    async (outcome) => {
      let resolveSend!: () => void;
      let rejectSend!: (error: Error) => void;
      let delivery!: Promise<void>;
      const notify = vi.spyOn(toast, "danger").mockImplementation(() => "toast");
      vi.mocked(submitThreadInput).mockImplementation((threadId, prompt, segments, options) => {
        delivery = performThreadInputSubmit({
          thread: { ...thread, id: threadId },
          prompt,
          ...(segments ? { segments } : {}),
          ...(options?.questionAnswer ? { questionAnswer: options.questionAnswer } : {}),
          transport: {
            sendThreadInput: () =>
              new Promise<void>((resolve, reject) => {
                resolveSend = resolve;
                rejectSend = reject;
              }),
          },
        });
        return delivery;
      });
      show();
      fireEvent.click(screen.getByRole("option", { name: /B/ }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit" })));
      const answerId = useAppStore.getState().runtimeItemIdsByThread[thread.id]!.at(-1)!;
      const answerView = render(
        <AppProvider>
          <ChatItemRow
            threadId={thread.id}
            entry={{ kind: "item", id: answerId }}
            checkpointRevert={null}
          />
        </AppProvider>,
      );
      expect(answerView.container.querySelector("svg.lucide-check")).not.toBeNull();
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(submitThreadInput).toHaveBeenCalledTimes(1);
      await act(async () => {
        if (outcome === "accepted") resolveSend();
        else rejectSend(new Error("Disconnected"));
        await delivery.catch(() => {});
      });
      expect(!!answerView.container.querySelector("svg.lucide-check")).toBe(outcome === "accepted");
      expect(!!screen.queryByRole("listbox")).toBe(outcome === "failed");
      expect(screen.queryByRole("option", { name: /B/ })?.getAttribute("aria-selected")).toBe(
        outcome === "failed" ? "true" : undefined,
      );
      expect(screen.queryByRole("button", { name: "Submit" })?.hasAttribute("disabled")).toBe(
        outcome === "failed" ? false : undefined,
      );
      notify.mockRestore();
    },
  );

  it("retires the form after a typed reply, including after remounting from persisted items", () => {
    const item = message();
    const reply: RuntimeChatItem = {
      id: "reply",
      type: "user_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "A" }] },
      streams: {},
    };
    seed([item, reply]);
    render(
      <AppProvider>
        <AssistantMessage threadId={thread.id} item={item} isTurnActive={false} />
        <ThreadMessageReplyDocks threadId={thread.id} />
      </AppProvider>,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText(/Which scope\?/)).toBeNull();
  });

  it("renders existing async replies as the shared answer card at the reply's checkpoint", () => {
    const item = message();
    const reply: RuntimeChatItem = {
      id: "reply",
      type: "user_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Which scope?\nB" }] },
      streams: {},
    };
    seed([
      item,
      {
        id: "progress",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Work continues." }] },
        streams: {},
      },
      reply,
    ]);
    const onRequestRevert = vi.fn<(itemId: string) => void>();
    const view = render(
      <AppProvider>
        <ChatItemRow
          threadId={thread.id}
          entry={{ kind: "item", id: reply.id }}
          checkpointRevert={{ itemId: reply.id, onRequestRevert }}
        />
      </AppProvider>,
    );
    expect(screen.getByText("Which scope?")).toBeTruthy();
    expect(
      screen.getByText("B").closest(".flex.items-start")?.querySelector("svg.lucide-check"),
    ).not.toBeNull();
    expect(screen.queryByText("A")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Revert to this checkpoint" }));
    expect(onRequestRevert).toHaveBeenCalledWith(reply.id);
    view.unmount();
    render(
      <AppProvider>
        <ChatItemRow
          threadId={thread.id}
          entry={{ kind: "item", id: reply.id }}
          checkpointRevert={null}
        />
      </AppProvider>,
    );
    expect(
      screen.getByText("B").closest(".flex.items-start")?.querySelector("svg.lucide-check"),
    ).not.toBeNull();
  });

  it("sends self-contained answer metadata and keeps the answer card after the source is paged out", async () => {
    seed([message()]);
    const questionAnswer = {
      questions: [{ header: "", question: "Which scope?", selected: [{ label: "B" }] }],
    };
    const transport = {
      sendThreadInput: vi.fn<(payload: SendThreadInputPayload) => Promise<void>>(async () => {}),
    };
    await act(async () => {
      await performThreadInputSubmit({
        thread,
        prompt: "Which scope?\nB",
        questionAnswer,
        transport,
      });
    });
    expect(transport.sendThreadInput).toHaveBeenCalledWith(
      expect.objectContaining({ questionAnswer }),
    );
    const current = useAppStore.getState();
    const answerId = current.runtimeItemIdsByThread[thread.id]!.at(-1)!;
    const answer = current.runtimeItemsByIdByThread[thread.id]![answerId]!;
    seed([JSON.parse(JSON.stringify(answer)) as RuntimeChatItem]);
    render(
      <AppProvider>
        <ChatItemRow
          threadId={thread.id}
          entry={{ kind: "item", id: answerId }}
          checkpointRevert={null}
        />
      </AppProvider>,
    );
    expect(
      screen.getByText("B").closest(".flex.items-start")?.querySelector("svg.lucide-check"),
    ).not.toBeNull();
  });

  it("keeps unrelated subsequent messages out of the answer card", () => {
    const item = message();
    const reply: RuntimeChatItem = {
      id: "reply",
      type: "user_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Use another approach." }] },
      streams: {},
    };
    const later: RuntimeChatItem = {
      ...reply,
      id: "later",
      payload: { content: [{ kind: "text", text: "Which scope?\nB" }] },
    };
    seed([item, reply, later]);
    const { container } = render(
      <AppProvider>
        <ChatItemRow
          threadId={thread.id}
          entry={{ kind: "item", id: later.id }}
          checkpointRevert={null}
        />
      </AppProvider>,
    );
    expect(container.querySelector("svg.lucide-check")).toBeNull();
    expect(screen.getByText(/Which scope\?/)).toBeTruthy();
  });

  it("does not turn failed replies or child-agent messages into answer cards", () => {
    const item = message();
    const reply: RuntimeChatItem = {
      id: "reply",
      type: "user_message",
      state: "completed",
      payload: {
        content: [{ kind: "text", text: "Which scope?\nB" }],
        clientInputDelivery: "failed",
      },
      streams: {},
    };
    seed([item, reply]);
    const view = render(
      <AppProvider>
        <ChatItemRow
          threadId={thread.id}
          entry={{ kind: "item", id: reply.id }}
          checkpointRevert={null}
        />
      </AppProvider>,
    );
    expect(view.container.querySelector("svg.lucide-check")).toBeNull();
    act(() =>
      seed([
        item,
        {
          ...reply,
          parentItemId: "child",
          payload: { content: [{ kind: "text", text: "Which scope?\nB" }] },
        },
      ]),
    );
    expect(view.container.querySelector("svg.lucide-check")).toBeNull();
  });

  it("keeps an unanswered form available after the provider finishes", () => {
    const item = message();
    seed([item]);
    useAppStore.setState({ threads: [{ ...thread, status: "idle", attention: "none" }] });
    render(
      <AppProvider>
        <AssistantMessage threadId={thread.id} item={item} isTurnActive={false} />
        <ThreadMessageReplyDocks threadId={thread.id} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("option", { name: /A/ }));
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows question-only messages in the composer without an empty chat row", () => {
    const item = { ...message(), payload: { content: [], replyForm: form } };
    expect(isVisibleRuntimeItem(item)).toBe(false);
    show(item);
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});
