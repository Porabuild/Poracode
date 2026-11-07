// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgeEditPrCommentPayload, PrComment } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
  TEST_CACHE_KEY,
} from "../testing/prDetailTestScope";
import { ActivityComposer } from "./ActivityComposer";
import { ActivityFeed } from "./ActivityFeed";

const mocks = vi.hoisted(() => ({
  post: vi.fn<(payload: { body: string }) => Promise<PrComment>>(),
  edit: vi.fn<(payload: ForgeEditPrCommentPayload) => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ forgePostPrComment: mocks.post, forgeEditPrComment: mocks.edit }),
  isRemoteSession: () => false,
}));

const comment = (id: string, login: string, at: string, body: string): PrComment => ({
  id,
  author: { login },
  body,
  createdAt: at,
});

const details = makeTestDetails({
  comments: [
    comment("c1", "viewer", "2026-07-01T10:00:00Z", "first comment"),
    comment("c3", "dave", "2026-07-03T10:00:00Z", "third comment"),
  ],
  reviews: [
    {
      id: "r1",
      author: { login: "carol" },
      state: "APPROVED",
      body: "",
      submittedAt: "2026-07-02T10:00:00Z",
    },
    // An empty drive-by review adds only noise.
    {
      id: "r2",
      author: { login: "erin" },
      state: "COMMENTED",
      body: "",
      submittedAt: "2026-07-02T11:00:00Z",
    },
  ],
  reviewThreads: [
    {
      id: "t1",
      isResolved: true,
      isOutdated: false,
      path: "src/a.ts",
      line: 7,
      side: "LEFT",
      comments: [comment("tc1", "frank", "2026-07-04T10:00:00Z", "inline remark")],
    },
  ],
});

function renderedOrder() {
  return screen
    .getAllByRole("listitem")
    .filter((item) => item.parentElement?.parentElement?.tagName === "SECTION")
    .map((item) => item.textContent ?? "");
}

describe("ActivityFeed", () => {
  it("lists comments, review verdicts and threads oldest first, skipping empty reviews", () => {
    renderInPrDetail(<ActivityFeed />, {}, { details });

    const items = renderedOrder();
    expect(items).toHaveLength(4);
    expect(items[0]).toContain("first comment");
    expect(items[1]).toContain("carol");
    expect(items[1]).toContain("approved");
    expect(items[2]).toContain("third comment");
    expect(items[3]).toContain("inline remark");
    expect(items[3]).toContain("Resolved");
    expect(screen.queryByText("erin")).not.toBeInTheDocument();
  });

  it("reverses the order with the toggle", () => {
    renderInPrDetail(<ActivityFeed />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Oldest first" }));

    expect(screen.getByRole("button", { name: "Newest first" })).toBeInTheDocument();
    const items = renderedOrder();
    expect(items[0]).toContain("inline remark");
    expect(items[3]).toContain("first comment");
  });

  it("marks an old-side thread and opens its line in Changes", () => {
    renderInPrDetail(<ActivityFeed />, {}, { details });

    expect(screen.getByText("Old side")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts:7 in changes" }));

    const nav = screen.getByTestId("pr-nav");
    expect(nav).toHaveAttribute("data-tab", "changes");
    expect(nav).toHaveAttribute("data-file", "src/a.ts");
    expect(nav).toHaveAttribute("data-line", "7");
    expect(nav).toHaveAttribute("data-side", "LEFT");
  });

  it("filters to comments or to reviews", async () => {
    renderInPrDetail(<ActivityFeed />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Filter activity" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Comments" }));
    await waitFor(() => expect(renderedOrder()).toHaveLength(2));
    expect(renderedOrder().join(" ")).not.toContain("carol");

    fireEvent.click(screen.getByRole("button", { name: "Filter activity" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reviews" }));
    await waitFor(() => expect(renderedOrder()).toHaveLength(2));
    expect(renderedOrder()[0]).toContain("carol");
    expect(renderedOrder()[1]).toContain("inline remark");

    fireEvent.click(screen.getByRole("button", { name: "Filter activity" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "All activity" }));
    await waitFor(() => expect(renderedOrder()).toHaveLength(4));
  });

  it("says so when the filter leaves nothing", async () => {
    renderInPrDetail(
      <ActivityFeed />,
      {},
      {
        details: makeTestDetails({ comments: [comment("c1", "bob", "2026-07-01T00:00:00Z", "x")] }),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter activity" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reviews" }));

    expect(await screen.findByText("Nothing matches this filter.")).toBeInTheDocument();
  });

  it("lets the viewer edit their own comment only, and saves through the host", async () => {
    mocks.edit.mockReset();
    mocks.edit.mockResolvedValue(undefined);
    const { scope } = renderInPrDetail(
      <ActivityFeed />,
      { scoped: makeTestScopedSource({ commentEditing: ["conversation", "inline"] }) },
      { details },
    );

    // Two comments are conversation comments, one is the viewer's.
    const editButtons = screen.getAllByRole("button", { name: "Edit comment" });
    expect(editButtons).toHaveLength(1);
    fireEvent.click(editButtons[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), {
      target: { value: "edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.edit).toHaveBeenCalledTimes(1));
    expect(mocks.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: "c1",
        body: "edited",
        expectedBody: "first comment",
        forgeRepository: "owner/repo",
      }),
    );
    await waitFor(() => expect(scope.reload).toHaveBeenCalledTimes(1));
  });

  it("disables comment editing while the review is read-only", () => {
    renderInPrDetail(
      <ActivityFeed />,
      { readOnly: true, scoped: makeTestScopedSource({ commentEditing: ["conversation"] }) },
      { details },
    );

    expect(screen.getByRole("button", { name: "Edit comment" })).toBeDisabled();
  });
});

describe("ActivityComposer", () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.post.mockImplementation(({ body }) =>
      Promise.resolve(comment("new", "viewer", "2026-07-09T00:00:00Z", body)),
    );
  });

  it("posts the comment, adds it to the store and reloads", async () => {
    const { scope } = renderInPrDetail(<ActivityComposer />, {}, { details });

    const box = screen.getByRole("textbox", { name: "Write a comment" });
    fireEvent.change(box, { target: { value: "  looks good  " } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({ body: "looks good", prNumber: 42, forgeRepository: "owner/repo" }),
    );
    await waitFor(() => expect(scope.reload).toHaveBeenCalledTimes(1));
    expect(useGitStore.getState().prDetails[TEST_CACHE_KEY]?.comments.at(-1)?.id).toBe("new");
    expect(box).toHaveValue("");
  });

  it("cannot post while the review is read-only", () => {
    renderInPrDetail(<ActivityComposer />, { readOnly: true }, { details });

    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("does not post an empty comment", () => {
    renderInPrDetail(<ActivityComposer />, {}, { details });

    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
  });
});
