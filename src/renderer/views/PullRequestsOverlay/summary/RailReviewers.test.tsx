// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ForgeListPrReviewerCandidatesPayload,
  ForgePrReviewerCandidatesResult,
  ForgeRequestPrReviewersPayload,
} from "@/shared/contracts";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
} from "../testing/prDetailTestScope";
import { RailReviewers } from "./RailReviewers";

const mocks = vi.hoisted(() => ({
  candidates:
    vi.fn<
      (payload: ForgeListPrReviewerCandidatesPayload) => Promise<ForgePrReviewerCandidatesResult>
    >(),
  request: vi.fn<(payload: ForgeRequestPrReviewersPayload) => Promise<void>>(),
  toastDanger: vi.fn<(message: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    forgeListPrReviewerCandidates: mocks.candidates,
    forgeRequestPrReviewers: mocks.request,
  }),
  isRemoteSession: () => false,
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: mocks.toastDanger, success: vi.fn<(message: string) => void>() },
}));

const details = makeTestDetails({
  author: { login: "author" },
  requestedReviewers: [{ id: "u-alice", login: "alice" }],
  reviews: [
    {
      id: "r1",
      author: { login: "carol" },
      state: "CHANGES_REQUESTED",
      body: "",
      submittedAt: "2026-07-01T00:00:00Z",
    },
    {
      id: "r2",
      author: { login: "carol" },
      state: "APPROVED",
      body: "",
      submittedAt: "2026-07-02T00:00:00Z",
    },
    {
      id: "r3",
      author: { login: "alice" },
      state: "COMMENTED",
      body: "x",
      submittedAt: "2026-07-01T00:00:00Z",
    },
  ],
});

describe("RailReviewers", () => {
  beforeEach(() => {
    mocks.candidates.mockReset();
    mocks.candidates.mockResolvedValue({
      reviewers: [
        { id: "u-alice", login: "alice" },
        { id: "u-author", login: "Author" },
        { id: "u-bob", login: "bob", name: "Bob Builder" },
        { id: "t-core", login: "core-team", team: true },
      ],
      truncated: false,
    });
    mocks.request.mockReset();
    mocks.request.mockResolvedValue(undefined);
    mocks.toastDanger.mockReset();
  });

  it("lists requested reviewers and the latest review state of each person", () => {
    renderInPrDetail(<RailReviewers />, {}, { details });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByTitle("alice")).toBeInTheDocument();
    expect(within(items[1]!).getByTitle("carol")).toBeInTheDocument();
    expect(within(items[0]!).getByRole("img", { name: "Commented" })).toBeInTheDocument();
    // Carol's later approval wins over her earlier change request.
    expect(within(items[1]!).getByRole("img", { name: "Approved" })).toBeInTheDocument();
    // Only a pending request can be removed.
    expect(within(items[1]!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("removes a requested reviewer and reloads", async () => {
    const { scope } = renderInPrDetail(<RailReviewers />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Remove alice" }));

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        add: [],
        remove: [{ id: "u-alice" }],
        forgeRepository: "owner/repo",
      }),
    );
    await waitFor(() => expect(scope.reload).toHaveBeenCalledTimes(1));
  });

  it("searches, hides requested reviewers and the author, and adds the choice", async () => {
    const { scope } = renderInPrDetail(<RailReviewers />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Request a reviewer" }));
    const list = await screen.findByRole("list", { name: "Reviewer candidates" });

    const offered = within(list).getAllByRole("button");
    expect(offered).toHaveLength(2);
    expect(offered[0]).toHaveTextContent("Bob Builder");
    expect(offered[1]).toHaveTextContent("core-team");
    expect(offered[1]).toHaveTextContent("Team");
    expect(mocks.candidates).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search people" }), {
      target: { value: "bo" },
    });
    await waitFor(() =>
      expect(mocks.candidates).toHaveBeenLastCalledWith(expect.objectContaining({ query: "bo" })),
    );
    fireEvent.click(await screen.findByRole("button", { name: /^bob/ }));

    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ add: [{ id: "u-bob" }], remove: [] }),
    );
    await waitFor(() => expect(scope.reload).toHaveBeenCalledTimes(1));
  });

  it("sends a group request as a team", async () => {
    renderInPrDetail(<RailReviewers />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Request a reviewer" }));
    fireEvent.click(await screen.findByRole("button", { name: /^core-team/ }));

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({ add: [{ id: "t-core", team: true }] }),
      ),
    );
  });

  it("asks the reviewer to refine the search when the host truncated the list", async () => {
    mocks.candidates.mockResolvedValue({ reviewers: [], truncated: true });
    renderInPrDetail(<RailReviewers />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Request a reviewer" }));

    expect(await screen.findByText("More people match. Refine your search.")).toBeInTheDocument();
  });

  it("reports a refused request without reloading", async () => {
    mocks.request.mockRejectedValueOnce(new Error("Cannot request"));
    const { scope } = renderInPrDetail(<RailReviewers />, {}, { details });

    fireEvent.click(screen.getByRole("button", { name: "Remove alice" }));

    await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledTimes(1));
    expect(scope.reload).not.toHaveBeenCalled();
  });

  it("hides add and remove without the reviewRequests capability", () => {
    renderInPrDetail(
      <RailReviewers />,
      { scoped: makeTestScopedSource({ reviewRequests: undefined }) },
      { details },
    );

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request a reviewer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove alice" })).not.toBeInTheDocument();
  });

  it("disables add and remove while the review is read-only", () => {
    renderInPrDetail(<RailReviewers />, { readOnly: true }, { details });

    expect(screen.getByRole("button", { name: "Request a reviewer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove alice" })).toBeDisabled();
  });
});
