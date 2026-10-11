// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrDetails, PrFile, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";

const layout = vi.hoisted(() => ({ compact: false }));

const bridge = vi.hoisted(() => ({
  ghGetPrFiles: vi.fn<() => Promise<{ files: PrFile[] }>>(),
  ghGetPrDiff: vi.fn<() => Promise<{ diff: string }>>(),
  ghGetPrDetails: vi.fn<() => Promise<{ details: PrDetails }>>(),
  ghSubmitPrReview: vi.fn<() => Promise<void>>(),
  openExternal: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { PrReviewOverlay } from "./PrReviewOverlay";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  createdAt: "2026-07-25T10:00:00.000Z",
  location: { kind: "windows", path: "C:\\repo" },
};

const files: PrFile[] = [{ path: "src/compact-only.ts", additions: 4, deletions: 1 }];

const details: PrDetails = {
  number: 12,
  title: "Compact PR review",
  body: "Review body",
  author: { login: "alice" },
  baseBranch: "main",
  headBranch: "feature",
  additions: 4,
  deletions: 1,
  changedFiles: 1,
  comments: [],
  reviews: [],
  commits: [],
  checks: [],
};

describe("PrReviewOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    bridge.ghGetPrFiles.mockReset().mockResolvedValue({ files });
    bridge.ghGetPrDiff.mockReset().mockResolvedValue({ diff: "" });
    bridge.ghGetPrDetails.mockReset().mockResolvedValue({ details });
    useGitStore.setState({
      prFiles: {},
      prDiffs: {},
      prDetails: {},
      prData: {},
    });
    useSidebarOverlayStore.setState({ isCollapsed: false, isAutoCollapsed: false });
  });

  it("navigates the file list and PR conversation as compact pages", async () => {
    layout.compact = true;
    useSidebarOverlayStore.setState({ isCollapsed: true, isAutoCollapsed: true });

    render(
      <PrReviewOverlay
        project={project}
        prNumber={12}
        prKey="__branch:project-1"
        onClose={() => {}}
      />,
    );

    const main = screen.getByRole("main");
    const file = await within(main).findByText("compact-only.ts");
    expect(file.closest(".invisible")).toBeNull();
    expect(within(main).getByRole("button", { name: "Conversation" })).toBeInTheDocument();
    expect(within(main).queryByRole("tab", { name: /Conversation/ })).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Refresh" })).toHaveClass(
      "m-home-compose-action",
    );

    fireEvent.click(within(main).getByRole("button", { name: "Conversation" }));
    await waitFor(() => {
      expect(within(main).getByRole("tab", { name: /Conversation/ })).toBeInTheDocument();
    });
    expect(within(main).queryByText("compact-only.ts")).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Submit review" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await within(main).findByText("compact-only.ts")).toBeInTheDocument();
    expect(within(main).queryByRole("tab", { name: /Conversation/ })).not.toBeInTheDocument();
  });
});
