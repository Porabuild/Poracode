import { screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";

const bridgeMock = vi.hoisted(() => ({
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridgeMock }));

vi.mock("@/renderer/state/gitRefresh", () => ({
  mightBeGitHubRemote: () => false,
  refreshGitProject: vi.fn<() => void>(),
  refreshSinglePr: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { threadRemoveAction: "archive" }) => unknown) =>
    selector({ threadRemoveAction: "archive" }),
}));

vi.mock("@/renderer/components/common", () => ({ BranchSelector: () => null }));

vi.mock("@/renderer/views/MainView/parts/AppShell/AppShell", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { SidebarContext: React.createContext(null) };
});

vi.mock("./GitReviewSidebar/GitReviewSidebar", () => ({
  GitReviewSidebar: () => <div data-testid="git-review-sidebar" />,
}));
vi.mock("./GitReviewTouchMenus", () => ({
  GitReviewTouchMenus: (props: { children: ReactNode }) => (
    <div data-testid="git-touch-menus">{props.children}</div>
  ),
}));
vi.mock("@/renderer/components/layout/MobilePageHeaderActions", () => ({
  MobilePageHeaderActions: (props: { children: ReactNode }) => <>{props.children}</>,
}));
vi.mock("./initGitRepository", () => ({
  addGitRemote: vi.fn<() => void>(),
  initGitRepository: vi.fn<() => void>(),
}));

vi.mock("@heroui/react", () => {
  const Button = (props: { "aria-label"?: string; children: ReactNode; onPress?: () => void }) => (
    <button type="button" aria-label={props["aria-label"]} onClick={props.onPress}>
      {props.children}
    </button>
  );
  const Tooltip = (props: { children: ReactNode }) => <>{props.children}</>;
  Tooltip.Trigger = (props: { children: ReactNode }) => <>{props.children}</>;
  Tooltip.Content = (props: { children: ReactNode }) => <>{props.children}</>;
  return { Button, Tooltip, toast: { danger: vi.fn<() => void>() } };
});

import { useGitStore } from "@/renderer/state/gitStore";
import { GitReviewPanel } from "./GitReviewPanel";

const cleanStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
  detail: "full",
};

describe("GitReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
    });
  });

  it("refreshes an existing full status when the panel opens", async () => {
    const project: Project = {
      id: "remote-project",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: {
        kind: "posix",
        path: "/Users/test/work/lightcode",
        remoteServerId: "remote-desktop",
      },
    };
    const currentStatus: GitStatusResult = {
      ...cleanStatus,
      unstaged: [
        {
          path: "README.md",
          status: "M",
          staged: false,
          insertions: 2,
          deletions: 0,
        },
      ],
      totalInsertions: 2,
    };
    useGitStore.getState().setStatus(project.id, cleanStatus);
    bridgeMock.getGitStatus.mockResolvedValue(currentStatus);

    render(
      <GitReviewPanel
        project={project}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(bridgeMock.getGitStatus).toHaveBeenCalledWith({
        projectLocation: project.location,
      });
      expect(useGitStore.getState().statuses[project.id]).toEqual(currentStatus);
    });
  });

  it("uses compact header actions and touch rows without the panel toolbar", () => {
    const project: Project = {
      id: "mobile-project",
      name: "Poracode",
      createdAt: new Date().toISOString(),
      location: { kind: "posix", path: "/repo" },
    };
    useGitStore.getState().setStatus(project.id, cleanStatus);
    bridgeMock.getGitStatus.mockResolvedValue(cleanStatus);

    render(
      <GitReviewPanel
        project={project}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
        hideHeader
        hideToolbar
        touchMode
        compactHeaderActions
      />,
    );

    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByTestId("git-touch-menus")).toContainElement(
      screen.getByTestId("git-review-sidebar"),
    );
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });
});
