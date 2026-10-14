import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("prompt") as HTMLInputElement;
        void Promise.resolve(props.onStart({ prompt: input.value })).catch(() => {});
      }}
    >
      <output aria-label="draft-project">{props.project.id}</output>
      <output aria-label="quick-composer">{String(props.quickComposer)}</output>
      <output aria-label="submit-on-enter">{String(props.submitOnEnter)}</output>
      <output aria-label="autofocus-composer">{String(props.autoFocusComposer)}</output>
      <input name="prompt" aria-label="Draft prompt" defaultValue="" />
      <button
        type="button"
        onClick={() =>
          props.onProjectChange?.(props.project.id === "project-1" ? "project-2" : "project-1")
        }
      >
        switch project
      </button>
      <button type="submit">start</button>
    </form>
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
    expect(screen.getByText("Plan, ask, build…")).toHaveClass("m-draft-collapsed-placeholder");
    expect(screen.getByTestId("dock")).not.toHaveAttribute("data-expanded");

    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded");

    fireEvent.click(screen.getByRole("button", { name: "switch project" }));
    expect(screen.getByLabelText("draft-project")).toHaveTextContent("project-2");
    fireEvent.change(screen.getByRole("textbox", { name: "Draft prompt" }), {
      target: { value: "Ship it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() => {
      expect(launchMock).toHaveBeenCalledWith(projectTwo, { prompt: "Ship it" });
      expect(screen.getByTestId("dock")).not.toHaveAttribute("data-expanded");
    });
  });

  it("starts a fresh editor after a successful launch in the same project", async () => {
    render(<MobileQuickCompose projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    const firstInput = screen.getByRole("textbox", { name: "Draft prompt" });
    fireEvent.change(firstInput, { target: { value: "First prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Draft prompt" })).toHaveValue("");
      expect(screen.getByRole("textbox", { name: "Draft prompt" })).not.toBe(firstInput);
    });
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Draft prompt" }), {
      target: { value: "Second prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    await waitFor(() =>
      expect(launchMock).toHaveBeenNthCalledWith(2, projectOne, { prompt: "Second prompt" }),
    );
  });

  it("retains the editor and prompt when launch fails", async () => {
    launchMock.mockRejectedValueOnce(new Error("launch failed"));
    render(<MobileQuickCompose projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    const input = screen.getByRole("textbox", { name: "Draft prompt" });
    fireEvent.change(input, { target: { value: "Retry this prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "start" }));

    await waitFor(() => expect(launchMock).toHaveBeenCalledOnce());
    expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded");
    expect(screen.getByRole("textbox", { name: "Draft prompt" })).toBe(input);
    expect(input).toHaveValue("Retry this prompt");
  });

  it("does not replace another project's editor when an earlier launch finishes", async () => {
    let finish!: () => void;
    launchMock.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    render(<MobileQuickCompose projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Draft prompt" }), {
      target: { value: "First project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "switch project" }));
    const secondInput = screen.getByRole("textbox", { name: "Draft prompt" });
    fireEvent.change(secondInput, { target: { value: "Keep this unsent" } });
    await act(async () => finish());
    expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded");
    expect(screen.getByRole("textbox", { name: "Draft prompt" })).toBe(secondInput);
    expect(secondInput).toHaveValue("Keep this unsent");
  });

  it("keeps a newer draft when the user returns to the launching project", async () => {
    let finish!: () => void;
    launchMock.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    render(<MobileQuickCompose projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Draft prompt" }), {
      target: { value: "Submitted prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "switch project" }));
    fireEvent.click(screen.getByRole("button", { name: "switch project" }));
    const newerInput = screen.getByRole("textbox", { name: "Draft prompt" });
    fireEvent.change(newerInput, { target: { value: "New unsent prompt" } });
    await act(async () => finish());
    expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded");
    expect(screen.getByRole("textbox", { name: "Draft prompt" })).toBe(newerInput);
    expect(newerInput).toHaveValue("New unsent prompt");
  });

  it("preserves an unsent editor when the dock is collapsed and reopened", () => {
    render(<MobileQuickCompose projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    const input = screen.getByRole("textbox", { name: "Draft prompt" });
    fireEvent.change(input, { target: { value: "Unsent prompt" } });
    fireEvent.click(screen.getByRole("button", { name: "collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(screen.getByRole("textbox", { name: "Draft prompt" })).toBe(input);
    expect(input).toHaveValue("Unsent prompt");
  });
});
