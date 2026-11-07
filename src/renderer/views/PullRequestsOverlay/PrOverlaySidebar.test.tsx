// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, PullRequestSummary } from "@/shared/contracts";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { PrOverlaySidebar } from "./PrOverlaySidebar";
import { DEFAULT_PR_LIST_FILTERS, pullRequestEntryKey } from "./list/prListModel";
import type { PullRequestEntry } from "./list/prListModel";
import type { PrListController } from "./list/usePrListController";

const openEntry = vi.hoisted(() => vi.fn<() => void>());
vi.mock("./list/openPullRequestEntry", () => ({ openPullRequestEntry: openEntry }));
vi.mock("./list/PrListPanel", () => ({ PrListPanel: () => null }));

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/work/poracode" },
  createdAt: "2026-07-13T10:00:00.000Z",
};

function entry(
  number: number,
  title: string,
  over: Partial<Omit<PullRequestSummary, "pr">> & {
    pr?: Partial<PullRequestSummary["pr"]>;
  } = {},
): PullRequestEntry {
  const { pr: prOver, ...rest } = over;
  return {
    project,
    summary: {
      pr: {
        number,
        state: "open",
        title,
        url: `https://github.com/example/poracode/pull/${number}`,
        baseBranch: "main",
        isDraft: false,
        viewerDidAuthor: false,
        updatedAt: "2026-07-13T11:00:00.000Z",
        ...prOver,
      },
      headBranch: `feature/${number}`,
      additions: 1,
      deletions: 0,
      repository: "example/poracode",
      reviewRequested: false,
      ...rest,
    },
  };
}

const entries = [
  entry(321, "Overlay rework", { pr: { viewerDidAuthor: true } }),
  entry(322, "Needs a look", { reviewRequested: true }),
  entry(325, "Harden checkout", {}),
];

function controller(list: PullRequestEntry[]): PrListController {
  return {
    state: "open",
    setState: () => {},
    sort: "updated",
    setSort: () => {},
    filters: DEFAULT_PR_LIST_FILTERS,
    setFilters: () => {},
    data: { entries: list, accountKey: () => undefined },
    filterControls: {},
    filterCount: 0,
    clearFilters: () => {},
  } as unknown as PrListController;
}

function rail() {
  return render(
    <PrOverlaySidebar
      controller={controller(entries)}
      selectedKey={null}
      onClose={vi.fn<() => void>()}
    />,
  );
}

describe("PrOverlaySidebar collapsed rail", () => {
  beforeEach(() => {
    openEntry.mockClear();
    useSidebarOverlayStore.setState({ isCollapsed: true, isNarrow: false });
  });

  it("lists every pull request grouped authored, reviewing, others", () => {
    rail();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((name) => name.startsWith("#"));
    expect(names).toEqual(["#321 Overlay rework", "#322 Needs a look", "#325 Harden checkout"]);
    expect(document.querySelectorAll(".bg-border\\/60")).toHaveLength(2);
  });

  it("marks the selected pull request as the current page", () => {
    const selected = pullRequestEntryKey(entries[1]!);
    render(
      <PrOverlaySidebar
        controller={controller(entries)}
        selectedKey={selected}
        onClose={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("button", { name: "#322 Needs a look" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens a pull request when its rail button is pressed", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "#325 Harden checkout" }));
    expect(openEntry).toHaveBeenCalledWith(entries[2]);
  });

  it("falls back to the static icon when there are no pull requests", () => {
    render(
      <PrOverlaySidebar
        controller={controller([])}
        selectedKey={null}
        onClose={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("button", { name: "Pull requests" })).toBeInTheDocument();
  });
});
