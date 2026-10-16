import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu } from "../composer/ComposerAddMenu";
import { isPlanModeControl, planWorkToggle } from "../providers/composerControlBuilders";
import {
  shouldMoveComposerControlToMobileOverflow,
  ThreadComposer,
  type ComposerControl,
} from "./ThreadComposer";

const { getDroppedFilePaths } = vi.hoisted(() => ({
  getDroppedFilePaths: vi.fn<(files: File[]) => string[]>(),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ getDroppedFilePaths }),
}));

const originalResizeObserver = globalThis.ResizeObserver;

class MockResizeObserver {
  static instances = new Set<MockResizeObserver>();

  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    MockResizeObserver.instances.add(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {
    MockResizeObserver.instances.delete(this);
  }

  static notify(element: Element) {
    for (const instance of MockResizeObserver.instances) {
      instance.#callback([{ target: element } as ResizeObserverEntry], instance as ResizeObserver);
    }
  }

  static reset() {
    MockResizeObserver.instances.clear();
  }
}

function composerControls(): ComposerControl[] {
  return [
    {
      value: "auto",
      options: [{ id: "auto", label: "Auto" }],
      hideLabelOnWrap: true,
    },
    {
      kind: "toggle",
      label: "Plan",
      isSelected: true,
      hideLabelOnWrap: true,
      onChange: vi.fn<(selected: boolean) => void>(),
    },
  ];
}

function renderComposer(controls = composerControls()) {
  return render(
    <ThreadComposer
      controls={controls}
      placeholder="Send a message..."
      prompt=""
      submitDisabled
      submitLabel="Send message"
      onPromptChange={vi.fn<(value: string) => void>()}
      onSubmit={vi.fn<() => void>()}
    />,
  );
}

function renderComposerWithAttach(onAttachFiles: (paths: string[]) => void) {
  return render(
    <ThreadComposer
      controls={composerControls()}
      placeholder="Send a message..."
      prompt=""
      submitDisabled
      submitLabel="Send message"
      onAttachFiles={onAttachFiles}
      onPromptChange={vi.fn<(value: string) => void>()}
      onSubmit={vi.fn<() => void>()}
    />,
  );
}

function attachmentPanel(
  onAttachFiles: (paths: string[]) => void,
  attachmentDropScope: "composer" | "panel" = "panel",
) {
  return (
    <div data-poracode-attachment-drop-target="">
      <p>Transcript</p>
      <ThreadComposer
        attachmentDropScope={attachmentDropScope}
        controls={[]}
        placeholder="Send a message..."
        prompt=""
        submitDisabled
        submitLabel="Send message"
        onAttachFiles={onAttachFiles}
        onPromptChange={vi.fn<(value: string) => void>()}
        onSubmit={vi.fn<() => void>()}
      />
    </div>
  );
}

function visibleText(text: string): HTMLElement {
  const matches = screen.getAllByText(text);
  const visible = matches.find((element) => !element.closest('[aria-hidden="true"]'));
  expect(visible).toBeDefined();
  return visible!;
}

function setProbeMeasurements(
  container: HTMLElement,
  widths: readonly number[],
  clientWidth = 100,
) {
  const probes = [...container.querySelectorAll<HTMLElement>(".probe-wrap-container")];
  for (const [index, probe] of probes.entries()) {
    Object.defineProperties(probe, {
      clientWidth: { configurable: true, get: () => clientWidth },
      scrollWidth: { configurable: true, get: () => widths[index] ?? 100 },
    });
  }
}

function composerToolbar(container: HTMLElement): HTMLElement {
  const toolbar = container.querySelector<HTMLElement>(".poracode-composer-toolbar");
  expect(toolbar).not.toBeNull();
  return toolbar!;
}

function setToolbarWidth(container: HTMLElement, width: number) {
  Object.defineProperty(composerToolbar(container), "clientWidth", {
    configurable: true,
    get: () => width,
  });
}

describe("ThreadComposer", () => {
  beforeEach(() => {
    getDroppedFilePaths.mockReset();
    MockResizeObserver.reset();
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("keeps Fast visible while moving lower-priority mobile controls into overflow", () => {
    expect(
      shouldMoveComposerControlToMobileOverflow({
        kind: "toggle",
        label: "Fast",
        isSelected: true,
      }),
    ).toBe(false);
    expect(
      shouldMoveComposerControlToMobileOverflow({
        kind: "toggle",
        label: "Work",
        isSelected: false,
      }),
    ).toBe(false);
    expect(
      shouldMoveComposerControlToMobileOverflow({
        value: "Auto",
        options: ["Auto"],
        iconKind: "permission",
      }),
    ).toBe(true);
  });

  it("does not hide labels just because they are eligible to hide on wrap", () => {
    renderComposer();

    expect(visibleText("Auto")).toBeVisible();
    expect(visibleText("Plan")).toBeVisible();
  });

  it("adds Plan from the plus menu and removes it from the controls row", () => {
    function Composer() {
      const [isPlanMode, setIsPlanMode] = useState(false);
      const control = planWorkToggle({
        isPlanMode,
        isDisabled: false,
        onChange: setIsPlanMode,
      });
      return (
        <ThreadComposer
          controls={[control]}
          placeholder="Send a message..."
          prompt=""
          submitDisabled
          submitLabel="Send message"
          onPromptChange={() => {}}
          onSubmit={() => {}}
          afterControls={
            <ComposerAddMenu
              mcpServers={[]}
              onPickFiles={() => {}}
              planControl={[control].find(isPlanModeControl)}
            />
          }
        />
      );
    }
    const { container } = render(<Composer />);
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Plan" })).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[aria-hidden="true"] .poracode-composer-toggle'),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Plan" }));
    const plan = screen.getByRole("button", { name: "Remove Plan" });
    expect(plan.closest(".poracode-composer-toolbar")).not.toBeNull();
    expect(plan.querySelector(".lucide-x")).not.toBeNull();
    expect(screen.queryByRole("menuitemcheckbox", { name: "Plan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    const selectedPlan = screen.getByRole("menuitemcheckbox", { name: "Plan" });
    expect(selectedPlan).toHaveAttribute("aria-checked", "true");
    fireEvent.click(selectedPlan);
    expect(screen.queryByRole("button", { name: "Remove Plan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    const unselectedPlan = screen.getByRole("menuitemcheckbox", { name: "Plan" });
    expect(unselectedPlan).toHaveAttribute("aria-checked", "false");
    fireEvent.click(unselectedPlan);
    fireEvent.click(screen.getByRole("button", { name: "Remove Plan" }));
    expect(screen.queryByRole("button", { name: "Remove Plan" })).not.toBeInTheDocument();
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });

  it("keeps the Plan chip disabled while its mode cannot change", () => {
    const onChange = vi.fn<(selected: boolean) => void>();
    renderComposer([
      { kind: "toggle", label: "Plan", isSelected: true, isDisabled: true, onChange },
    ]);
    const plan = screen.getByRole("button", { name: "Remove Plan" });
    expect(plan).toBeDisabled();
    fireEvent.click(plan);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides eligible labels when resize measurement requires a collapsed level", () => {
    const { container } = renderComposer();
    const controls = container.querySelector<HTMLElement>(".poracode-composer-toolbar > .relative");
    expect(controls).not.toBeNull();

    setProbeMeasurements(container, [160, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "1");
    expect(visibleText("Auto")).toHaveAttribute("data-collapse-tier", "1");
    expect(visibleText("Plan")).toHaveAttribute("data-collapse-tier", "1");
  });

  it("does not expand collapsed labels again at the same measured width", () => {
    const { container } = renderComposer();
    const controls = container.querySelector<HTMLElement>(".poracode-composer-toolbar > .relative");
    expect(controls).not.toBeNull();

    setProbeMeasurements(container, [101, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "1");

    setProbeMeasurements(container, [100, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "1");

    setProbeMeasurements(container, [101, 100, 100, 100, 100, 100], 101);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "0");
  });

  it("does not expand labels while the outer toolbar width is decreasing", () => {
    const { container } = renderComposer();
    const controls = container.querySelector<HTMLElement>(".poracode-composer-toolbar > .relative");
    expect(controls).not.toBeNull();

    setToolbarWidth(container, 200);
    setProbeMeasurements(container, [100, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "0");

    setToolbarWidth(container, 120);
    setProbeMeasurements(container, [121, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "1");
    expect(composerToolbar(container)).toHaveAttribute("data-width-decreasing");

    setProbeMeasurements(container, [110, 100, 100, 100, 100, 100], 130);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "1");

    setToolbarWidth(container, 121);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "0");
    expect(composerToolbar(container)).not.toHaveAttribute("data-width-decreasing");
  });

  it("can collapse permission labels before mode labels", () => {
    const { container } = renderComposer([
      {
        value: "full-access",
        options: [{ id: "full-access", label: "Full access" }],
        iconKind: "permission",
        hideLabelOnWrap: true,
        tier: 2,
      },
      {
        kind: "toggle",
        label: "Plan",
        isSelected: true,
        hideLabelOnWrap: true,
        tier: 3,
        onChange: vi.fn<(selected: boolean) => void>(),
      },
    ]);
    const controls = container.querySelector<HTMLElement>(".poracode-composer-toolbar > .relative");
    expect(controls).not.toBeNull();

    setProbeMeasurements(container, [160, 160, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(composerToolbar(container)).toHaveAttribute("data-wrap-level", "2");
    expect(visibleText("Full access")).toHaveAttribute("data-collapse-tier", "2");
    expect(visibleText("Plan")).toHaveAttribute("data-collapse-tier", "3");
  });

  it("measures the displayed family name without repeating tuple selector labels", () => {
    const { container } = renderComposer([
      {
        kind: "provider-model",
        currentAgentKind: "example",
        currentModel: "opaque-pair",
        hideLabelOnWrap: true,
        onChange: vi.fn<(next: { agentKind: string; model: string }) => void>(),
        providers: [
          {
            kind: "example",
            label: "Example",
            capabilities: {
              models: [
                {
                  id: "opaque-pair",
                  label: "Pair (A very long lead name + A very long sidekick name)",
                },
              ],
              efforts: [],
              modelEfforts: {},
              modes: [],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "server",
              presentationMode: "gui",
              settingDefs: [],
              modelFamilies: [
                {
                  model: "opaque-pair",
                  label: "Pair",
                  bindings: { effort: "config", fast: "config" },
                  selectors: [
                    {
                      id: "mate",
                      labelKey: "modelSelection.sidekick",
                      options: [{ id: "a", label: "A very long sidekick name" }],
                    },
                  ],
                  members: [{ model: "opaque-pair", selections: { mate: "a" } }],
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent("Pair");
    expect(screen.getByRole("button", { name: "Select model" })).not.toHaveTextContent(
      "sidekick name",
    );
    const expandedProbe = container.querySelector('[data-wrap-level="0"] .probe-wrap-container');
    expect(expandedProbe).toHaveTextContent("Pair");
    expect(expandedProbe).not.toHaveTextContent("sidekick name");
  });

  it("labels a thinking-only effort context control", () => {
    renderComposer([
      {
        kind: "effort-context",
        efforts: [],
        contextSizes: [],
        thinkingSupported: true,
        thinkingValue: false,
        onThinkingChange: vi.fn<(selected: boolean) => void>(),
        hideLabelOnWrap: true,
      },
    ]);

    expect(visibleText("Thinking")).toBeVisible();
  });

  it("shows an attachment drop target for supported files", () => {
    const { container } = renderComposerWithAttach(vi.fn<() => void>());
    const shell = container.querySelector<HTMLElement>(".poracode-composer-shell");
    expect(shell).not.toBeNull();

    fireEvent.dragEnter(shell!, {
      dataTransfer: { types: ["Files"], files: [], dropEffect: "copy" },
    });

    expect(screen.getByText("Drop here to attach")).toBeVisible();
  });

  it("attaches files dragged from the project tree", () => {
    const onAttachFiles = vi.fn<(paths: string[]) => void>();
    const { container } = renderComposerWithAttach(onAttachFiles);
    const shell = container.querySelector<HTMLElement>(".poracode-composer-shell");
    expect(shell).not.toBeNull();

    fireEvent.drop(shell!, {
      dataTransfer: {
        types: ["application/poracode-composer-file"],
        files: [],
        getData: (type: string) =>
          type === "application/poracode-composer-file"
            ? JSON.stringify({ path: "src/App.tsx", type: "file" })
            : "",
      },
    });

    expect(onAttachFiles).toHaveBeenCalledWith(["src/App.tsx"]);
  });

  it.each(["panel", "transcript", "input"])(
    "attaches OS files dropped on the %s through the native path bridge",
    (surface) => {
      const onAttachFiles = vi.fn<(paths: string[]) => void>();
      const { container } = render(attachmentPanel(onAttachFiles));
      const panel = container.querySelector("[data-poracode-attachment-drop-target]")!;
      const target =
        surface === "panel"
          ? panel
          : surface === "transcript"
            ? screen.getByText("Transcript")
            : screen.getByRole("textbox");
      const file = new File(["hello"], "notes.txt", { type: "text/plain" });
      const dataTransfer = { types: ["Files"], files: [file], getData: () => "" };
      getDroppedFilePaths.mockReturnValue(["C:\\repo\\notes.txt"]);

      fireEvent.dragEnter(target, { dataTransfer });
      expect(screen.getByText("Drop here to attach")).toBeVisible();
      fireEvent.drop(target, { dataTransfer });

      expect(getDroppedFilePaths).toHaveBeenCalledExactlyOnceWith([file]);
      expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith(["C:\\repo\\notes.txt"]);
      expect(screen.queryByText("Drop here to attach")).not.toBeInTheDocument();
    },
  );

  it("attaches a project-tree file once when dropped inside the panel input", () => {
    const onAttachFiles = vi.fn<(paths: string[]) => void>();
    render(attachmentPanel(onAttachFiles));

    fireEvent.drop(screen.getByRole("textbox"), {
      dataTransfer: {
        types: ["application/poracode-composer-file"],
        files: [],
        getData: () => JSON.stringify({ path: "src/App.tsx", type: "file" }),
      },
    });

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith(["src/App.tsx"]);
    expect(getDroppedFilePaths).not.toHaveBeenCalled();
  });

  it("keeps the drop prompt while moving between nested elements and clears it on exit", () => {
    const { container } = render(attachmentPanel(vi.fn()));
    const panel = container.querySelector("[data-poracode-attachment-drop-target]")!;
    const transcript = screen.getByText("Transcript");
    const dataTransfer = { types: ["Files"], files: [] };

    fireEvent.dragEnter(panel, { dataTransfer });
    fireEvent.dragEnter(transcript, { dataTransfer });
    fireEvent.dragLeave(panel, { dataTransfer });
    expect(screen.getByText("Drop here to attach")).toBeVisible();
    fireEvent.dragLeave(transcript, { dataTransfer });
    expect(screen.queryByText("Drop here to attach")).not.toBeInTheDocument();
  });

  it.each(["dragend", "blur"])("clears the drop prompt when the window receives %s", (type) => {
    render(attachmentPanel(vi.fn()));
    fireEvent.dragEnter(screen.getByText("Transcript"), {
      dataTransfer: { types: ["Files"], files: [] },
    });
    expect(screen.getByText("Drop here to attach")).toBeVisible();

    fireEvent(window, new Event(type));

    expect(screen.queryByText("Drop here to attach")).not.toBeInTheDocument();
  });

  it("ignores text drags and keeps adjacent panels independent", () => {
    const firstAttach = vi.fn<(paths: string[]) => void>();
    const secondAttach = vi.fn<(paths: string[]) => void>();
    const { container } = render(
      <>
        {attachmentPanel(firstAttach)}
        {attachmentPanel(secondAttach)}
      </>,
    );
    const [first, second] = container.querySelectorAll("[data-poracode-attachment-drop-target]");
    const textTransfer = { types: ["text/plain"], files: [], getData: () => "hello" };
    expect(fireEvent.dragOver(first!, { dataTransfer: textTransfer })).toBe(true);
    fireEvent.dragEnter(first!, { dataTransfer: textTransfer });
    fireEvent.drop(first!, { dataTransfer: textTransfer });
    expect(screen.queryByText("Drop here to attach")).not.toBeInTheDocument();

    const dataTransfer = {
      types: ["application/poracode-composer-file"],
      files: [],
      getData: () => JSON.stringify({ path: "src/App.tsx", type: "file" }),
    };
    fireEvent.dragEnter(second!, { dataTransfer });
    expect(second).toContainElement(screen.getByText("Drop here to attach"));
    expect(first).not.toContainElement(screen.getByText("Drop here to attach"));
    fireEvent.drop(second!, { dataTransfer });
    expect(secondAttach).toHaveBeenCalledExactlyOnceWith(["src/App.tsx"]);
    expect(firstAttach).not.toHaveBeenCalled();
  });

  it("moves the drop listener back to the composer when its scope changes", () => {
    const onAttachFiles = vi.fn<(paths: string[]) => void>();
    const { rerender } = render(attachmentPanel(onAttachFiles));
    const dataTransfer = {
      types: ["application/poracode-composer-file"],
      files: [],
      getData: () => JSON.stringify({ path: "src/App.tsx", type: "file" }),
    };
    fireEvent.dragEnter(screen.getByText("Transcript"), { dataTransfer });
    expect(screen.getByText("Drop here to attach")).toBeVisible();

    rerender(attachmentPanel(onAttachFiles, "composer"));

    expect(screen.queryByText("Drop here to attach")).not.toBeInTheDocument();
    fireEvent.drop(screen.getByText("Transcript"), { dataTransfer });
    expect(onAttachFiles).not.toHaveBeenCalled();
    fireEvent.drop(screen.getByRole("textbox"), { dataTransfer });
    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith(["src/App.tsx"]);
  });
});

it("keeps one pairing button in the toolbar and measures its summary in every geometry probe", () => {
  const model: ComposerControl = {
    kind: "provider-model",
    providers: [],
    currentAgentKind: "test",
    currentModel: "Pair",
    onChange: vi.fn<() => void>(),
  };
  const pairing: ComposerControl = {
    kind: "effort-context",
    efforts: [],
    contextSizes: [],
    hideLabelOnWrap: true,
    tier: 4,
    familySelection: {
      agentKind: "example",
      effortScope: "primary",
      columns: [
        {
          id: "lead",
          label: "Main",
          icon: null,
          models: {
            options: [{ id: "a", label: "Alpha" }],
            value: "a",
            onChange: vi.fn<() => void>(),
          },
        },
        {
          id: "sidekick",
          label: "Sidekick",
          icon: null,
          models: {
            options: [{ id: "b", label: "Beta" }],
            value: "b",
            onChange: vi.fn<() => void>(),
          },
        },
      ],
    },
  };
  const { container } = renderComposer([model, pairing, ...composerControls()]);
  expect(screen.getAllByRole("button", { name: "Model pairing" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Model pairing" })).toHaveTextContent("Alpha + Beta");
  expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sidekick" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Effort and context" })).not.toBeInTheDocument();
  const probes = [...container.querySelectorAll(".probe-wrap-container")];
  expect(probes).toHaveLength(6);
  for (const [level, probe] of probes.entries()) {
    const controls = [
      ...probe.querySelectorAll(".poracode-composer-menu, .poracode-composer-toggle"),
    ];
    expect(controls).toHaveLength(4);
    expect(controls[0]).toHaveTextContent("Pair");
    expect(controls[1]!.textContent).toBe(level < 4 ? "Alpha + Beta" : "");
  }
});

it("keeps ordinary controls in order without adding a pairing or duplicate effort button", () => {
  renderComposer([
    {
      kind: "provider-model",
      providers: [],
      currentAgentKind: "test",
      currentModel: "Solo",
      onChange: vi.fn<() => void>(),
    },
    {
      kind: "effort-context",
      efforts: [{ id: "high", label: "High" }],
      effortValue: "high",
      contextSizes: [],
    },
    { kind: "toggle", label: "Fast", isSelected: false, onChange: vi.fn<() => void>() },
  ]);
  expect(screen.queryByRole("button", { name: "Main" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sidekick" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Select model" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Effort and context" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Fast" })).toHaveLength(1);
});
