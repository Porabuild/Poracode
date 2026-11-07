// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { friendlyError } from "@/shared/messages";
import { bridge, resetBridge } from "../changes/changesFixtures";
import { useReviewDraftStore } from "../changes/prReviewDraftStore";
import {
  makeTestDetails,
  makeTestPrData,
  makeTestScopedSource,
  renderInPrDetail,
  TEST_CACHE_KEY,
  TEST_PR_KEY,
  TEST_PR_NUMBER,
} from "../testing/prDetailTestScope";
import { SubmitReviewPopover } from "./SubmitReviewPopover";

vi.mock("@/renderer/bridge", async () => {
  const { bridge: fake } = await import("../changes/changesFixtures");
  return { readBridge: () => fake, isRemoteSession: () => false, isMac: () => false };
});

const HEAD = "abcdef1234567";
const LOCATION = { kind: "posix", path: "/repo" } as const;

function renderPopover(
  options: {
    capabilities?: Parameters<typeof makeTestScopedSource>[0];
    hidden?: boolean;
    disabled?: boolean;
    prState?: "open" | "closed" | "merged";
    onSubmitted?: () => void;
    label?: string;
  } = {},
) {
  const scoped = makeTestScopedSource(options.capabilities);
  const onSubmitted = options.onSubmitted ?? vi.fn<() => void>();
  const view = renderInPrDetail(
    <SubmitReviewPopover
      projectLocation={LOCATION}
      prNumber={TEST_PR_NUMBER}
      cacheKey={TEST_CACHE_KEY}
      prKey={TEST_PR_KEY}
      hidden={options.hidden === true}
      disabled={options.disabled === true}
      onSubmitted={onSubmitted}
      triggerLabel={options.label ?? "Review changes"}
    />,
    { scoped, source: scoped, headSha: HEAD },
    {
      details: makeTestDetails({ source: scoped }),
      prData: makeTestPrData({
        source: scoped,
        ...(options.prState ? { state: options.prState } : {}),
      }),
    },
  );
  return { ...view, onSubmitted };
}

function draft(overrides: Partial<Parameters<typeof addDraft>[0]> = {}) {
  return addDraft({
    path: "src/a.ts",
    side: "RIGHT",
    line: 2,
    body: "Use a constant",
    headSha: HEAD,
    ...overrides,
  });
}

function addDraft(input: Parameters<ReturnType<typeof useReviewDraftStore.getState>["add"]>[1]) {
  return useReviewDraftStore.getState().add(TEST_CACHE_KEY, input);
}

function open(name = "Review changes") {
  fireEvent.click(screen.getByRole("button", { name }));
}

function remaining() {
  return useReviewDraftStore.getState().byReview[TEST_CACHE_KEY] ?? [];
}

describe("SubmitReviewPopover", () => {
  beforeEach(() => {
    resetBridge();
    useReviewDraftStore.setState({ byReview: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it("submits a plain review through the legacy call when nothing is drafted", async () => {
    const success = vi.spyOn(toast, "success");
    const { onSubmitted } = renderPopover();
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Review comment" }), {
      target: { value: "Looks fine" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(bridge.forgeSubmitPrReview).toHaveBeenCalledExactlyOnceWith({
      projectLocation: LOCATION,
      prNumber: TEST_PR_NUMBER,
      decision: "comment",
      body: "Looks fine",
      forgeRepository: "owner/repo",
      forgeAccount: expect.objectContaining({ login: "viewer" }),
    });
    expect(bridge.forgeSubmitPrReviewDraft).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith("Comment posted");
    success.mockRestore();
  });

  it.each(["closed", "merged"] as const)(
    "hides the review trigger when the PR is %s",
    (prState) => {
      renderPopover({ prState });
      expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();
    },
  );

  it("lays each decision out as one row: the radio control sits inside the clickable row", () => {
    renderPopover();
    open();
    for (const name of [/Comment/, /Approve/, /Request changes/]) {
      const radio = screen.getByRole("radio", { name });
      const row = radio.closest('[data-slot="radio-content"]');
      expect(row).not.toBeNull();
      expect(row?.querySelector('[data-slot="radio-control"]')).not.toBeNull();
    }
  });

  it("requires a body for a comment or a change request, but not for an approval", () => {
    renderPopover();
    open();
    const submit = screen.getByRole("button", { name: "Submit review" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Approve/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /Request changes/ }));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Review comment" }), {
      target: { value: "Needs work" },
    });
    expect(submit).toBeEnabled();
  });

  it("counts the drafts and submits them with the decision, the head and every comment", async () => {
    draft();
    draft({ side: "LEFT", line: 5, body: "Why remove?", path: "src/lib/b.ts" });
    const { onSubmitted } = renderPopover();
    open();
    expect(screen.getByText("2 draft comments")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Request changes/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Review comment" }), {
      target: { value: "See inline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(bridge.forgeSubmitPrReviewDraft).toHaveBeenCalledExactlyOnceWith({
      projectLocation: LOCATION,
      prNumber: TEST_PR_NUMBER,
      decision: "request-changes",
      body: "See inline",
      expectedHeadSha: HEAD,
      comments: [
        { path: "src/a.ts", side: "RIGHT", line: 2, body: "Use a constant" },
        { path: "src/lib/b.ts", side: "LEFT", line: 5, body: "Why remove?" },
      ],
      forgeRepository: "owner/repo",
      forgeAccount: expect.objectContaining({ login: "viewer" }),
    });
    expect(bridge.forgeSubmitPrReview).not.toHaveBeenCalled();
    expect(remaining()).toEqual([]);
  });

  it("lets a drafted review be a bare comment without a summary", async () => {
    const success = vi.spyOn(toast, "success");
    draft();
    const { onSubmitted } = renderPopover();
    open();
    expect(screen.getByText("1 draft comment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(bridge.forgeSubmitPrReviewDraft).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "comment", body: "" }),
    );
    expect(success).toHaveBeenCalledWith("Review submitted");
    success.mockRestore();
  });

  it("keeps every draft and says why when the host refuses the submission", async () => {
    draft();
    const failure = new Error(
      "The pull request changed after these line comments were drafted. Refresh and check them before submitting.",
    );
    bridge.forgeSubmitPrReviewDraft.mockRejectedValue(failure);
    const { onSubmitted } = renderPopover();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(friendlyError(failure));
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(remaining()).toHaveLength(1);
    expect(screen.getByText("1 draft comment")).toBeInTheDocument();
    // The reviewer can fix the cause and send the same drafts again.
    bridge.forgeSubmitPrReviewDraft.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(remaining()).toEqual([]);
  });

  it("does not send drafts from another head, and can discard them", async () => {
    draft();
    draft({ body: "stale", headSha: "0000000aaaaaa", line: 9 });
    const { onSubmitted } = renderPopover();
    open();
    expect(screen.getByText("1 draft comment")).toBeInTheDocument();
    expect(screen.getByText("1 outdated draft will not be submitted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(bridge.forgeSubmitPrReviewDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        comments: [expect.objectContaining({ body: "Use a constant" })],
      }),
    );
    expect(remaining()).toEqual([expect.objectContaining({ body: "stale" })]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Discard outdated" }));
    expect(remaining()).toEqual([]);
  });

  it("ignores drafts and uses the plain review on a host without draft reviews", async () => {
    draft();
    const { onSubmitted } = renderPopover({ capabilities: { reviewDrafts: undefined } });
    open();
    expect(screen.queryByText(/draft comment/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Review comment" }), {
      target: { value: "Plain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledOnce());
    expect(bridge.forgeSubmitPrReview).toHaveBeenCalledOnce();
    expect(bridge.forgeSubmitPrReviewDraft).not.toHaveBeenCalled();
  });

  it("refuses more than 100 line comments", () => {
    for (let line = 1; line <= 101; line += 1) draft({ line, body: `c${line}` });
    renderPopover();
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("at most 100 line comments");
    fireEvent.click(screen.getByRole("radio", { name: /Approve/ }));
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
  });

  it("jumps to a draft's line from the list", () => {
    draft();
    renderPopover();
    open();
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:2" }));
    expect(screen.getByTestId("pr-nav")).toHaveAttribute("data-file", "src/a.ts");
    expect(screen.getByTestId("pr-nav")).toHaveAttribute("data-tab", "changes");
  });

  it("is hidden for the author's own review and disabled while read-only", () => {
    const hidden = renderPopover({ hidden: true });
    expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();
    hidden.unmount();
    renderPopover({ disabled: true });
    expect(screen.getByRole("button", { name: "Review changes" })).toBeDisabled();
  });

  it("shows how many drafts the review will carry on its trigger", () => {
    draft();
    draft({ line: 3 });
    renderPopover();
    expect(
      within(screen.getByRole("button", { name: /Review changes/ })).getByText("2"),
    ).toBeInTheDocument();
    act(() =>
      useReviewDraftStore.getState().removeMany(
        TEST_CACHE_KEY,
        remaining().map((d) => d.id),
      ),
    );
    expect(
      within(screen.getByRole("button", { name: /Review changes/ })).queryByText("2"),
    ).not.toBeInTheDocument();
  });
});
