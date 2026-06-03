import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";

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
      isSelected: false,
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

function visibleText(text: string): HTMLElement {
  const matches = screen.getAllByText(text);
  const visible = matches.find((element) => !element.closest('[aria-hidden="true"]'));
  expect(visible).toBeDefined();
  return visible!;
}

function setProbeMeasurements(container: HTMLElement, widths: readonly number[]) {
  const probes = [...container.querySelectorAll<HTMLElement>(".probe-wrap-container")];
  for (const [index, probe] of probes.entries()) {
    Object.defineProperties(probe, {
      clientWidth: { configurable: true, get: () => 100 },
      scrollWidth: { configurable: true, get: () => widths[index] ?? 100 },
    });
  }
}

describe("ThreadComposer", () => {
  beforeEach(() => {
    MockResizeObserver.reset();
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("does not hide labels just because they are eligible to hide on wrap", () => {
    renderComposer();

    expect(visibleText("Auto")).toBeVisible();
    expect(visibleText("Plan")).toBeVisible();
  });

  it("hides eligible labels when resize measurement requires a collapsed level", () => {
    const { container } = renderComposer();
    const controls = container.querySelector<HTMLElement>(
      ".lightcode-composer-toolbar > .relative",
    );
    expect(controls).not.toBeNull();

    setProbeMeasurements(container, [160, 100, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(visibleText("Auto")).toHaveClass("is-hidden");
    expect(visibleText("Plan")).toHaveClass("is-hidden");
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
        label: "Work",
        isSelected: false,
        hideLabelOnWrap: true,
        tier: 3,
        onChange: vi.fn<(selected: boolean) => void>(),
      },
    ]);
    const controls = container.querySelector<HTMLElement>(
      ".lightcode-composer-toolbar > .relative",
    );
    expect(controls).not.toBeNull();

    setProbeMeasurements(container, [160, 160, 100, 100, 100, 100]);

    act(() => {
      MockResizeObserver.notify(controls!);
    });

    expect(visibleText("Full access")).toHaveClass("is-hidden");
    expect(visibleText("Work")).not.toHaveClass("is-hidden");
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
    const { container } = renderComposerWithAttach(vi.fn());
    const shell = container.querySelector<HTMLElement>(".lightcode-composer-shell");
    expect(shell).not.toBeNull();

    fireEvent.dragEnter(shell!, {
      dataTransfer: { types: ["Files"], files: [], dropEffect: "copy" },
    });

    expect(screen.getByText("Drop here to attach")).toBeVisible();
  });

  it("attaches files dragged from the project tree", () => {
    const onAttachFiles = vi.fn<(paths: string[]) => void>();
    const { container } = renderComposerWithAttach(onAttachFiles);
    const shell = container.querySelector<HTMLElement>(".lightcode-composer-shell");
    expect(shell).not.toBeNull();

    fireEvent.drop(shell!, {
      dataTransfer: {
        types: ["application/lightcode-composer-file"],
        files: [],
        getData: (type: string) =>
          type === "application/lightcode-composer-file"
            ? JSON.stringify({ path: "src/App.tsx", type: "file" })
            : "",
      },
    });

    expect(onAttachFiles).toHaveBeenCalledWith(["src/App.tsx"]);
  });
});
