import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { RemoteClientError } from "@/shared/remote/client";
import { findPlanRevisionOption } from "@/shared/runtimeRequestForms";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlanReviewDraft } from "./planReviewDrafts";
import { ThreadRuntimeRequestPanel } from "./ThreadRuntimeRequestPanel";

const PLAN = "# Plan\n1. Add the flag\n2. Wire it up";
const options = [
  { optionId: "deny", label: "No, keep planning" },
  { optionId: "default", label: "Yes, and manually approve edits" },
];

function planRequest(overrides: { options?: typeof options; plan?: string | undefined } = {}) {
  const plan = "plan" in overrides ? overrides.plan : PLAN;
  return {
    requestId: "plan-review",
    threadId: "plan-thread",
    requestType: "tool_user_input" as const,
    receivedAt: "2026-11-03T00:00:00Z",
    payload: {
      summary: "Proposed plan",
      details: { toolName: "ExitPlanMode", input: plan ? { plan } : {} },
      options: overrides.options ?? options,
    },
  };
}

function renderPanel(
  request = planRequest(),
  handlers: {
    onResolve?: () => Promise<void>;
    sendFeedback?: ((message: string) => Promise<void>) | null;
  } = {},
) {
  const onResolve = vi.fn<() => Promise<void>>(handlers.onResolve ?? (() => Promise.resolve()));
  const send =
    handlers.sendFeedback === undefined ? () => Promise.resolve() : handlers.sendFeedback;
  const onSubmitPlanFeedback = vi.fn<(message: string) => Promise<void>>((message: string) =>
    send ? send(message) : Promise.resolve(),
  );
  render(
    <AppProvider>
      <ThreadRuntimeRequestPanel
        threadId="plan-thread"
        request={request}
        onResolve={onResolve}
        {...(send ? { onSubmitPlanFeedback } : {})}
      />
    </AppProvider>,
  );
  return { onResolve, onSubmitPlanFeedback };
}

/** Select lines like the user does: press on a line, optionally drag/Shift-extend, release. */
function selectLines(from: number, to = from, how: "drag" | "shift" = "drag") {
  const first = screen.getByRole("button", { name: `Plan line ${from}` });
  if (how === "drag") {
    fireEvent.mouseDown(first);
    if (to !== from) fireEvent.mouseEnter(screen.getByRole("button", { name: `Plan line ${to}` }));
    fireEvent.mouseUp(window);
    return;
  }
  fireEvent.mouseDown(first);
  fireEvent.mouseUp(window);
  fireEvent.mouseDown(screen.getByRole("button", { name: `Plan line ${to}` }), { shiftKey: true });
  fireEvent.mouseUp(window);
}

function addNote(text: string) {
  fireEvent.change(screen.getByLabelText("Comment on the selected lines"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Comment" }));
}

/** The footer Close; the dialog's corner close trigger shares the name. */
function closeReview() {
  fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
}

/**
 * Mirrors the composer docks: the panel exists only while the store holds the
 * open request, keyed by request id, so an optimistic resolution unmounts it.
 */
function StoreBackedPanel(props: {
  onResolve: () => Promise<void>;
  onSubmitPlanFeedback: (message: string) => Promise<void>;
}) {
  const request = useAppStore((state) => state.runtimeRequestsByThread["plan-thread"]?.[0]);
  return request ? (
    <ThreadRuntimeRequestPanel
      key={request.requestId}
      threadId="plan-thread"
      request={request}
      onResolve={props.onResolve}
      onSubmitPlanFeedback={props.onSubmitPlanFeedback}
    />
  ) : null;
}

function openStoreRequest() {
  const request = planRequest();
  useAppStore.getState().applyRuntimeEvent("plan-thread", {
    type: "request.opened",
    threadId: "plan-thread",
    requestId: request.requestId,
    requestType: request.requestType,
    payload: request.payload,
  });
}

beforeEach(() => {
  // jsdom has no layout; the comment form scrolls itself into view on open.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn<(options?: ScrollIntoViewOptions) => void>(),
  });
});

afterEach(() => {
  cleanup();
  useComposerInputInbox.setState({ itemsByComposer: {} });
  useAppStore.setState({ runtimeRequestsByThread: {} });
  clearPlanReviewDraft("plan-thread", "plan-review");
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("plan feedback review", () => {
  it("keeps comments as local drafts, then answers the review and sends one follow-up", async () => {
    const { onResolve, onSubmitPlanFeedback } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    addNote("name the flag");
    selectLines(2, 3, "shift");
    addNote("cover errors too");

    // Each comment shows inline and in the side list.
    expect(screen.getAllByText("name the flag")).toHaveLength(2);
    expect(screen.getAllByText("Lines 2–3").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe("2 comments");
    expect(onResolve).not.toHaveBeenCalled();
    expect(onSubmitPlanFeedback).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onSubmitPlanFeedback).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledExactlyOnceWith({
      requestId: "plan-review",
      method: "requestPermission",
      response: { optionId: "deny" },
      analytics: { outcome: "declined", requestType: "tool_user_input" },
    });
    const message = onSubmitPlanFeedback.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("Line 2:\n```\n1. Add the flag\n```\nFeedback: name the flag");
    expect(message).toContain("Lines 2-3:\n```\n1. Add the flag\n2. Wire it up\n```");
  });

  it("selects a dragged range and labels the comment form with it", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1, 3);
    expect(screen.getByText("Lines 1–3")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Comment on the selected lines")).toBeNull();
  });

  it("selects a line by clicking its text", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.click(screen.getByText("Wire it up"));
    expect(screen.getByText("Line 3")).toBeDefined();
    expect(screen.getByLabelText("Comment on the selected lines")).toBeDefined();
  });

  it("selects a line from the keyboard", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Plan line 2" }), { key: "Enter" });
    expect(screen.getByLabelText("Comment on the selected lines")).toBeDefined();
  });

  it("closes only the comment form on Escape", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    fireEvent.keyDown(screen.getByLabelText("Comment on the selected lines"), { key: "Escape" });
    expect(screen.queryByLabelText("Comment on the selected lines")).toBeNull();
    expect(screen.getByRole("button", { name: "Plan line 2" })).toBeDefined();
  });

  it("edits a posted comment in place", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    addNote("first take");
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const field = screen.getByLabelText("Comment on the selected lines") as HTMLTextAreaElement;
    expect(field.value).toBe("first take");
    fireEvent.change(field, { target: { value: "second take" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByText("first take")).toBeNull();
    expect(screen.getAllByText("second take")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("1 comment");
  });

  it("sends overall feedback without any line comments", async () => {
    const { onSubmitPlanFeedback } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.change(screen.getByLabelText("Overall feedback"), {
      target: { value: "Split this into two PRs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onSubmitPlanFeedback).toHaveBeenCalledTimes(1));
    expect(onSubmitPlanFeedback.mock.calls[0]?.[0]).toBe(
      "Please revise the plan you proposed.\n\nOverall feedback:\nSplit this into two PRs\n\nRespond with a complete revised plan.",
    );
  });

  it("returns to the plan without answering the review", () => {
    const { onResolve } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1);
    addNote("note");
    closeReview();
    expect(onResolve).not.toHaveBeenCalled();
    // Closing the review keeps the drafts for when it is reopened.
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    expect(screen.getAllByText("note")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toBe("1 comment");
  });

  it("requires feedback before a revision can be requested", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    const submit = screen.getByRole("button", { name: "Request revision" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("does not send feedback when answering the plan review fails", async () => {
    const { onResolve, onSubmitPlanFeedback } = renderPanel(planRequest(), {
      onResolve: () => Promise.reject(new Error("offline")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1);
    addNote("note");
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onSubmitPlanFeedback).not.toHaveBeenCalled();
    // The request stays open and the drafts survive for another attempt.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Review plan" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    expect(screen.getAllByText("note")).toHaveLength(2);
  });

  it("restores the notes as a composer draft when the follow-up fails to send", async () => {
    const { onResolve } = renderPanel(planRequest(), {
      sendFeedback: () => Promise.reject(new Error("send failed")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1);
    addNote("note");
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() =>
      expect(useComposerInputInbox.getState().itemsByComposer["plan-thread"]).toHaveLength(1),
    );
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it("keeps drafts when answering the review fails and the panel remounts", async () => {
    openStoreRequest();
    const onResolve = vi.fn<() => Promise<void>>(() => Promise.reject(new Error("offline")));
    const onSubmitPlanFeedback = vi.fn<(message: string) => Promise<void>>(() => Promise.resolve());
    render(
      <AppProvider>
        <StoreBackedPanel onResolve={onResolve} onSubmitPlanFeedback={onSubmitPlanFeedback} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    addNote("keep me");
    fireEvent.change(screen.getByLabelText("Overall feedback"), { target: { value: "and me" } });
    // Typed but never posted: still part of what the user asked to send.
    selectLines(3);
    fireEvent.change(screen.getByLabelText("Comment on the selected lines"), {
      target: { value: "unposted too" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    // The optimistic resolution unmounts the panel; the rollback mounts a new one.
    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Review plan" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    expect(screen.getAllByText("keep me")).toHaveLength(2);
    expect(screen.getAllByText("unposted too")).toHaveLength(2);
    expect((screen.getByLabelText("Overall feedback") as HTMLTextAreaElement).value).toBe("and me");
    expect(onSubmitPlanFeedback).not.toHaveBeenCalled();
  });

  it("clears the drafts once the revision request is answered", async () => {
    openStoreRequest();
    const onSubmitPlanFeedback = vi.fn<(message: string) => Promise<void>>(() => Promise.resolve());
    render(
      <AppProvider>
        <StoreBackedPanel
          onResolve={() => Promise.resolve()}
          onSubmitPlanFeedback={onSubmitPlanFeedback}
        />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    addNote("sent once");
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onSubmitPlanFeedback).toHaveBeenCalledTimes(1));
    // The same request reopening (e.g. a replay) must not resurrect sent drafts.
    openStoreRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Review plan" }));
    expect(screen.queryByText("sent once")).toBeNull();
  });

  it("does not queue a duplicate when the send outcome is uncertain", async () => {
    const { onSubmitPlanFeedback } = renderPanel(planRequest(), {
      sendFeedback: () =>
        Promise.reject(new RemoteClientError("uncertain", 409, "command_outcome_uncertain")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1);
    addNote("note");
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onSubmitPlanFeedback).toHaveBeenCalledTimes(1));
    // Let the rejected send settle before checking that nothing was queued.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useComposerInputInbox.getState().itemsByComposer["plan-thread"]).toBeUndefined();
  });

  it("includes text still in the open form when requesting a revision", async () => {
    const { onSubmitPlanFeedback } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    fireEvent.change(screen.getByLabelText("Comment on the selected lines"), {
      target: { value: "typed but not posted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await waitFor(() => expect(onSubmitPlanFeedback).toHaveBeenCalledTimes(1));
    expect(onSubmitPlanFeedback.mock.calls[0]?.[0]).toContain(
      "Line 2:\n```\n1. Add the flag\n```\nFeedback: typed but not posted",
    );
  });

  it("keeps typed text when another line is clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(2);
    const field = screen.getByLabelText("Comment on the selected lines") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "half written" } });
    selectLines(3);
    expect(screen.getByText("Line 2")).toBeDefined();
    expect(
      (screen.getByLabelText("Comment on the selected lines") as HTMLTextAreaElement).value,
    ).toBe("half written");
  });

  it("keeps typed text when Edit is pressed on another comment", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(1);
    addNote("posted");
    selectLines(3);
    fireEvent.change(screen.getByLabelText("Comment on the selected lines"), {
      target: { value: "half written" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    expect(
      (screen.getByLabelText("Comment on the selected lines") as HTMLTextAreaElement).value,
    ).toBe("half written");
  });

  it("scrolls the comment form into view when it opens", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    selectLines(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("ignores right-clicks on line numbers", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Plan line 2" }), { button: 2 });
    fireEvent.mouseUp(window);
    expect(screen.queryByLabelText("Comment on the selected lines")).toBeNull();
  });

  it("keeps one line number in the tab order and moves with the arrow keys", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Review plan" }));
    const first = screen.getByRole("button", { name: "Plan line 1" });
    const second = screen.getByRole("button", { name: "Plan line 2" });
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    expect(second.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(second.getAttribute("aria-describedby")!)?.textContent).toBe(
      "1.Add the flag",
    );
  });

  it("offers no review without plan text, a revision option, or a sender", () => {
    renderPanel(planRequest({ plan: undefined }));
    expect(screen.queryByRole("button", { name: "Review plan" })).toBeNull();
    cleanup();
    renderPanel(planRequest({ options: [options[1]!] }));
    expect(screen.queryByRole("button", { name: "Review plan" })).toBeNull();
    cleanup();
    renderPanel(planRequest(), { sendFeedback: null });
    expect(screen.queryByRole("button", { name: "Review plan" })).toBeNull();
  });
});

describe("findPlanRevisionOption", () => {
  it("prefers the revise option over a plain negative one", () => {
    const request = planRequest({
      options: [
        { optionId: "plan_approve", label: "Approve" },
        { optionId: "plan_reject_and_exit", label: "Reject and exit" },
        { optionId: "plan_revise", label: "Revise" },
      ],
    });
    expect(findPlanRevisionOption(request)?.optionId).toBe("plan_revise");
  });

  it("falls back to the negative option and ignores non-plan requests", () => {
    expect(findPlanRevisionOption(planRequest())?.optionId).toBe("deny");
    const other = planRequest();
    other.payload.details.toolName = "Bash";
    expect(findPlanRevisionOption(other)).toBeUndefined();
  });
});
