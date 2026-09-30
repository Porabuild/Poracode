import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => true,
}));

import { usePanelStore } from "@/renderer/state/panelStore";
import { openGitReview } from "./panelActions";

describe("compact panel actions", () => {
  beforeEach(() => {
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      rightPanelTab: "files",
      mobileUtilityPage: null,
    });
  });

  it("opens a Git badge target on the dedicated Git and Files page", () => {
    openGitReview("project-1", "/repo/.poracode/worktrees/mobile", "thread-1");

    expect(usePanelStore.getState()).toMatchObject({
      gitReviewContext: {
        projectId: "project-1",
        worktreePath: "/repo/.poracode/worktrees/mobile",
        originComposerId: "thread-1",
      },
      gitReviewAsPanel: true,
      gitOverlayOpen: false,
      rightPanelTab: "git",
      mobileUtilityPage: "workspace",
    });
  });
});
