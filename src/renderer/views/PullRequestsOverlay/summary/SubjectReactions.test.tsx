// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgeSetPrReactionPayload, PrReaction } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  makeTestDetails,
  makeTestScopedSource,
  renderInPrDetail,
  TEST_CACHE_KEY,
} from "../testing/prDetailTestScope";
import { PrReactionAdd, PrReactionChips } from "../parts/PrReactions";
import { useSubjectReactions } from "./SubjectReactions";

/** What a comment card renders: the add button in its header, the chips below. */
function Subject(props: { subjectId?: string; reactions: readonly PrReaction[] | undefined }) {
  const view = useSubjectReactions({
    ...(props.subjectId !== undefined ? { subjectId: props.subjectId } : {}),
    reactions: props.reactions,
  });
  return (
    <div>
      <header>
        <PrReactionAdd {...view} />
      </header>
      <PrReactionChips {...view} />
    </div>
  );
}

const mocks = vi.hoisted(() => ({
  react: vi.fn<(payload: ForgeSetPrReactionPayload) => Promise<void>>(),
  toastDanger: vi.fn<(message: string) => void>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ forgeSetPrReaction: mocks.react }),
  isRemoteSession: () => false,
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: mocks.toastDanger, success: vi.fn<(message: string) => void>() },
}));

const bodyReactions = [
  { content: "+1", count: 2, viewerReacted: false },
  { content: "heart", count: 1, viewerReacted: true },
  { content: "mystery", count: 4, viewerReacted: false },
];

function sourceSupporting(reactions: string[]) {
  return makeTestScopedSource({ reactions });
}

function storedBodyReactions() {
  return useGitStore.getState().prDetails[TEST_CACHE_KEY]?.reactions;
}

describe("subject reactions", () => {
  beforeEach(() => {
    mocks.react.mockReset();
    mocks.react.mockResolvedValue(undefined);
    mocks.toastDanger.mockReset();
  });

  function renderBody(overrides: Parameters<typeof renderInPrDetail>[1] = {}) {
    return renderInPrDetail(<Subject reactions={bodyReactions} />, overrides, {
      details: makeTestDetails({ reactions: bodyReactions }),
    });
  }

  it("renders no chips row for a subject without reactions, and the header button still adds one", async () => {
    const { scope } = renderInPrDetail(
      <Subject reactions={[]} />,
      {},
      {
        details: makeTestDetails({ reactions: [] }),
      },
    );

    expect(screen.queryByRole("button", { name: /: \d+$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add reaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rocket" }));

    await waitFor(() =>
      expect(mocks.react).toHaveBeenCalledWith(
        expect.objectContaining({ content: "rocket", reacted: true, prNumber: scope.prNumber }),
      ),
    );
  });

  it("shows known reactions with their counts and skips unknown contents", () => {
    renderBody();

    expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Heart: 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("adds a reaction optimistically for the description, without a subject id or a reload", async () => {
    const { scope } = renderBody();

    fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));

    expect(storedBodyReactions()?.find((r) => r.content === "+1")).toEqual({
      content: "+1",
      count: 3,
      viewerReacted: true,
    });
    await waitFor(() => expect(mocks.react).toHaveBeenCalledTimes(1));
    expect(mocks.react).toHaveBeenCalledWith({
      projectLocation: scope.location,
      prNumber: 42,
      content: "+1",
      reacted: true,
      forgeAccount: scope.scoped?.account,
      forgeRepository: "owner/repo",
    });
    expect(scope.reload).not.toHaveBeenCalled();
  });

  it("removes the viewer's reaction and drops the chip when it was the last one", async () => {
    renderBody();

    fireEvent.click(screen.getByRole("button", { name: "Heart: 1" }));

    expect(storedBodyReactions()?.some((r) => r.content === "heart")).toBe(false);
    await waitFor(() =>
      expect(mocks.react).toHaveBeenCalledWith(
        expect.objectContaining({ content: "heart", reacted: false }),
      ),
    );
  });

  it("rolls the counts back and reports the error when the host refuses", async () => {
    mocks.react.mockRejectedValueOnce(new Error("Host said no"));
    renderBody();

    fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));

    await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledTimes(1));
    expect(storedBodyReactions()).toEqual(bodyReactions);
  });

  describe("against a reload and a refusal", () => {
    function hostCopy(reactions: typeof bodyReactions) {
      return makeTestDetails({ reactions });
    }

    function reloadLands(reactions: typeof bodyReactions, scopeKey = TEST_CACHE_KEY) {
      act(() => {
        useGitStore.getState().setPrDetails(scopeKey, hostCopy(reactions));
      });
    }

    it("keeps the toggled state when a reload finishes with the host's older copy mid-toggle", async () => {
      const held = Promise.withResolvers<void>();
      mocks.react.mockReturnValueOnce(held.promise);
      renderBody();

      fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));
      reloadLands(bodyReactions);

      expect(storedBodyReactions()?.find((r) => r.content === "+1")).toEqual({
        content: "+1",
        count: 3,
        viewerReacted: true,
      });
      await act(async () => {
        held.resolve();
        await held.promise;
      });
      expect(storedBodyReactions()?.find((r) => r.content === "+1")?.viewerReacted).toBe(true);
    });

    it("writes the confirmed state again when a load that began earlier ends after the host accepted it", async () => {
      renderBody({ loading: true });

      fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));
      await waitFor(() => expect(mocks.react).toHaveBeenCalledTimes(1));
      await act(async () => {
        await Promise.resolve();
      });
      reloadLands(bodyReactions);

      expect(storedBodyReactions()?.find((r) => r.content === "+1")).toEqual({
        content: "+1",
        count: 3,
        viewerReacted: true,
      });
    });

    it("does not hold the state once the host accepted it and nothing is loading", async () => {
      renderBody();

      fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));
      await waitFor(() => expect(mocks.react).toHaveBeenCalledTimes(1));
      await act(async () => {
        await Promise.resolve();
      });
      reloadLands([{ content: "+1", count: 9, viewerReacted: false }]);

      expect(storedBodyReactions()).toEqual([{ content: "+1", count: 9, viewerReacted: false }]);
    });

    it("disables a chip while its own toggle is in flight and enables it after", async () => {
      const held = Promise.withResolvers<void>();
      mocks.react.mockReturnValueOnce(held.promise);
      renderBody();

      fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toBeDisabled(),
      );
      expect(screen.getByRole("button", { name: "Heart: 1" })).toBeEnabled();
      await act(async () => {
        held.resolve();
        await held.promise;
      });
      expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toBeEnabled();
    });

    it("restores the exact snapshot, order included, when a removed chip is refused", async () => {
      mocks.react.mockRejectedValueOnce(new Error("Host said no"));
      renderBody();

      fireEvent.click(screen.getByRole("button", { name: "Heart: 1" }));

      await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledTimes(1));
      expect(storedBodyReactions()).toEqual(bodyReactions);
    });

    it("keeps the counts a reload reported and only reverts the viewer's own state when refused", async () => {
      const held = Promise.withResolvers<void>();
      mocks.react.mockReturnValueOnce(held.promise);
      renderBody();

      fireEvent.click(screen.getByRole("button", { name: "Thumbs up: 2" }));
      reloadLands([{ content: "+1", count: 5, viewerReacted: false }]);
      expect(storedBodyReactions()).toEqual([{ content: "+1", count: 6, viewerReacted: true }]);
      await act(async () => {
        held.reject(new Error("Host said no"));
        await held.promise.catch(() => undefined);
      });

      await waitFor(() => expect(mocks.toastDanger).toHaveBeenCalledTimes(1));
      expect(storedBodyReactions()).toEqual([{ content: "+1", count: 5, viewerReacted: false }]);
    });
  });

  it("targets a comment by its id and updates only that comment", async () => {
    const comments = [
      {
        id: "c1",
        author: { login: "bob" },
        body: "one",
        createdAt: "2026-07-01T00:00:00Z",
        reactions: [{ content: "eyes", count: 1, viewerReacted: false }],
      },
      { id: "c2", author: { login: "bob" }, body: "two", createdAt: "2026-07-01T00:00:00Z" },
    ];
    renderInPrDetail(
      <Subject subjectId="c1" reactions={comments[0]?.reactions} />,
      {},
      { details: makeTestDetails({ comments }) },
    );

    fireEvent.click(screen.getByRole("button", { name: "Eyes: 1" }));

    await waitFor(() =>
      expect(mocks.react).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: "c1", content: "eyes", reacted: true }),
      ),
    );
    const stored = useGitStore.getState().prDetails[TEST_CACHE_KEY]?.comments;
    expect(stored?.[0]?.reactions).toEqual([{ content: "eyes", count: 2, viewerReacted: true }]);
    expect(stored?.[1]?.reactions).toBeUndefined();
  });

  it("hides the control without an account-scoped source", () => {
    renderBody({ scoped: undefined });
    expect(screen.queryByRole("button", { name: "Add reaction" })).not.toBeInTheDocument();
  });

  it("lists only supported contents when adding a reaction", async () => {
    const { scope } = renderInPrDetail(<Subject reactions={undefined} />, {
      scoped: sourceSupporting(["rocket", "laugh", "mystery"]),
    });

    fireEvent.click(screen.getByRole("button", { name: "Add reaction" }));
    const dialog = await screen.findByTestId("reaction-picker-grid");

    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Rocket", "Laugh"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Rocket" }));
    await waitFor(() =>
      expect(mocks.react).toHaveBeenCalledWith(
        expect.objectContaining({ content: "rocket", reacted: true }),
      ),
    );
    expect(scope.reload).not.toHaveBeenCalled();
  });

  it("hides the control when the host supports no reactions", () => {
    const { container } = renderInPrDetail(<Subject reactions={bodyReactions} />, {
      scoped: sourceSupporting([]),
    });

    expect(container.querySelector("button")).toBeNull();
  });

  it("disables every reaction while the review is read-only", () => {
    renderBody({ readOnly: true });

    expect(screen.getByRole("button", { name: "Thumbs up: 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add reaction" })).toBeDisabled();
    expect(mocks.react).not.toHaveBeenCalled();
  });
});
