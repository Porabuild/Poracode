import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { MobileQuickCompose } from "./MobileQuickCompose";

const launchMock = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock("@/renderer/actions/threadLaunchActions", () => ({
  startThreadFromDraft: launchMock,
}));

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useDraftEnvironment: () => ({
    agentStatuses: [],
    isDetectingAgents: false,
  }),
}));

vi.mock("@/renderer/components/mobileComposer/FloatingComposerDock", () => ({
  FloatingComposerDock: (props: {
    expanded?: boolean;
    collapsedTapLabel?: string;
    children: React.ReactNode;
    onExpandedChange?: (expanded: boolean) => void;
  }) => (
    <div data-testid="dock" data-expanded={props.expanded || undefined}>
      <button type="button" onClick={() => props.onExpandedChange?.(true)}>
        {props.collapsedTapLabel}
      </button>
      <button type="button" onClick={() => props.onExpandedChange?.(false)}>
        collapse
      </button>
      {props.children}
    </div>
  ),
}));

vi.mock("@/renderer/components/thread/ThreadDraftView", () => ({
  ThreadDraftView: (props: {
    project: Project;
    quickComposer?: boolean;
    submitOnEnter?: boolean;
    autoFocusComposer?: boolean;
    onProjectChange?: (projectId: string) => void;
    onStart: (input: { prompt: string }) => void | Promise<void>;
  }) => (
    <div>
      <output aria-label="draft-project">{props.project.id}</output>
      <output aria-label="quick-composer">{String(props.quickComposer)}</output>
      <output aria-label="submit-on-enter">{String(props.submitOnEnter)}</output>
      <output aria-label="autofocus-composer">{String(props.autoFocusComposer)}</output>
      <button type="button" onClick={() => props.onProjectChange?.("project-2")}>
        switch project
      </button>
      <button type="button" onClick={() => void props.onStart({ prompt: "Ship it" })}>
        start
      </button>
    </div>
  ),
}));

const projectOne = {
  id: "project-1",
  name: "One",
  location: { kind: "windows", path: "C:\\one" },
} as Project;
const projectTwo = {
  id: "project-2",
  name: "Two",
  location: { kind: "windows", path: "C:\\two" },
} as Project;

describe("MobileQuickCompose", () => {
  beforeEach(() => {
    launchMock.mockClear();
    launchMock.mockResolvedValue(undefined);
    useAppStore.setState({ projects: [projectOne, projectTwo] });
  });

  it("expands the old PWA dock around the canonical draft and launches through current actions", async () => {
    render(<MobileQuickCompose projectId="project-1" />);

    expect(screen.getByLabelText("quick-composer")).toHaveTextContent("undefined");
    expect(screen.getByLabelText("submit-on-enter")).toHaveTextContent("false");
    expect(screen.getByLabelText("autofocus-composer")).toHaveTextContent("false");
    expect(screen.getByTestId("dock")).not.toHaveAttribute("data-expanded");

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded");

    fireEvent.click(screen.getByRole("button", { name: "switch project" }));
    expect(screen.getByLabelText("draft-project")).toHaveTextContent("project-2");
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() => {
      expect(launchMock).toHaveBeenCalledWith(projectTwo, { prompt: "Ship it" });
      expect(screen.getByTestId("dock")).not.toHaveAttribute("data-expanded");
    });
  });
});
