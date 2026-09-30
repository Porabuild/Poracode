import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { useThreadOutputStore } from "@/renderer/state/threadOutputStore";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { TerminalSurfaces } from "./TerminalSurfaces";

const { state } = vi.hoisted(() => ({
  state: {
    focusCalls: [] as string[],
    refitCalls: [] as string[],
    surfaceProps: new Map<
      string,
      {
        outputSource?: (listener: TerminalFeedListener) => () => void;
        initialScrollback?: string;
        preferDomRenderer?: boolean;
        resizeTerminalOnFit?: boolean;
        suppressTouchKeyboard?: boolean;
        themeBackgroundVar?: string;
        touchScrollEnabled?: boolean;
      }
    >(),
  },
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { terminalPanelFontSize: number }) => number) =>
    selector({ terminalPanelFontSize: 12 }),
}));

vi.mock("@/renderer/components/terminal/XTermSurface", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    XTermSurface: React.forwardRef<
      {
        focus: () => void;
        refit: () => void;
        findNext: () => boolean;
        findPrevious: () => boolean;
        clearSearch: () => void;
      },
      {
        terminalId: string;
        outputSource?: (listener: TerminalFeedListener) => () => void;
        initialScrollback?: string;
        preferDomRenderer?: boolean;
        resizeTerminalOnFit?: boolean;
        suppressTouchKeyboard?: boolean;
        themeBackgroundVar?: string;
        touchScrollEnabled?: boolean;
      }
    >(function MockXTermSurface(props, ref) {
      state.surfaceProps.set(props.terminalId, props);
      React.useImperativeHandle(ref, () => ({
        focus: () => state.focusCalls.push(props.terminalId),
        refit: () => state.refitCalls.push(props.terminalId),
        findNext: () => false,
        findPrevious: () => false,
        clearSearch: () => undefined,
      }));
      return React.createElement("div", { "data-testid": `terminal-${props.terminalId}` });
    }),
  };
});

const tabA: DevTerminalTab = {
  id: "shell:a",
  projectId: "project-1",
  title: "app",
  createdAt: "2026-05-11T00:00:00.000Z",
};

const tabB: DevTerminalTab = {
  id: "shell:b",
  projectId: "project-1",
  title: "server",
  createdAt: "2026-05-11T00:00:01.000Z",
};

async function flushFocusFrames() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function renderSurfaces(props: {
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  focusRequestId: number;
}) {
  return (
    <TerminalSurfaces
      tabs={[tabA, tabB]}
      selectedTabId={props.selectedTabId}
      activeTab={props.activeTab}
      focusRequestId={props.focusRequestId}
      markTabActive={vi.fn<() => void>()}
      updateTabTitle={vi.fn<() => void>()}
    />
  );
}

describe("TerminalSurfaces", () => {
  beforeEach(() => {
    useThreadOutputStore.setState({ buffers: {} });
    state.focusCalls = [];
    state.refitCalls = [];
    state.surfaceProps.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("focuses the selected terminal when the selected tab changes", async () => {
    const { rerender } = render(
      renderSurfaces({ selectedTabId: tabA.id, activeTab: tabA, focusRequestId: 1 }),
    );
    await flushFocusFrames();
    expect(state.focusCalls).toEqual([tabA.id]);

    rerender(renderSurfaces({ selectedTabId: tabB.id, activeTab: tabB, focusRequestId: 1 }));
    await flushFocusFrames();

    expect(state.focusCalls).toEqual([tabA.id, tabB.id]);
  });

  it("focuses the selected terminal again when focus is requested for the same tab", async () => {
    const { rerender } = render(
      renderSurfaces({ selectedTabId: tabB.id, activeTab: tabB, focusRequestId: 1 }),
    );
    await flushFocusFrames();

    rerender(renderSurfaces({ selectedTabId: tabB.id, activeTab: tabB, focusRequestId: 2 }));
    await flushFocusFrames();

    expect(state.focusCalls).toEqual([tabB.id, tabB.id]);
  });

  it("refits the selected terminal when the selected tab changes", async () => {
    const { rerender } = render(
      renderSurfaces({ selectedTabId: tabA.id, activeTab: tabA, focusRequestId: 1 }),
    );
    await flushFocusFrames();
    expect(state.refitCalls).toEqual([tabA.id]);

    rerender(renderSurfaces({ selectedTabId: tabB.id, activeTab: tabB, focusRequestId: 1 }));
    await flushFocusFrames();

    expect(state.refitCalls).toEqual([tabA.id, tabB.id]);
  });

  it("does not focus the add-tab placeholder", async () => {
    render(renderSurfaces({ selectedTabId: "__add__", activeTab: undefined, focusRequestId: 1 }));
    await flushFocusFrames();

    expect(state.focusCalls).toEqual([]);
  });

  it("connects every reused desktop surface to a caller-provided terminal feed", () => {
    const unsubscribe = vi.fn<() => void>();
    const watchTerminal = vi.fn<(terminalId: string, listener: TerminalFeedListener) => () => void>(
      () => unsubscribe,
    );
    render(
      <TerminalSurfaces
        tabs={[tabA, tabB]}
        selectedTabId={tabA.id}
        activeTab={tabA}
        focusRequestId={1}
        markTabActive={vi.fn<() => void>()}
        updateTabTitle={vi.fn<() => void>()}
        watchTerminal={watchTerminal}
      />,
    );

    const surface = state.surfaceProps.get(tabA.id);
    const listener: TerminalFeedListener = {
      onOutput: vi.fn<(data: string) => void>(),
      onReset: vi.fn<() => void>(),
      onExited: vi.fn<(exitCode: number | null) => void>(),
    };
    expect(surface?.initialScrollback).toBe("");
    expect(surface?.preferDomRenderer).toBe(true);
    expect(surface?.outputSource?.(listener)).toBe(unsubscribe);
    expect(watchTerminal).toHaveBeenCalledWith(tabA.id, listener);
  });

  it("restores retained output when an action terminal remounts", () => {
    const actionTab = { ...tabA, runActionId: "dev" };
    useThreadOutputStore.getState().appendOutput(actionTab.id, "finished output\r\n");

    render(
      <TerminalSurfaces
        tabs={[actionTab]}
        selectedTabId={actionTab.id}
        activeTab={actionTab}
        focusRequestId={1}
        markTabActive={vi.fn<() => void>()}
        updateTabTitle={vi.fn<() => void>()}
      />,
    );

    expect(state.surfaceProps.get(actionTab.id)?.initialScrollback).toBe("finished output\r\n");
  });

  it("uses touch-safe xterm behavior on the compact terminal page", () => {
    render(
      <TerminalSurfaces
        tabs={[tabA]}
        selectedTabId={tabA.id}
        activeTab={tabA}
        focusRequestId={1}
        markTabActive={vi.fn<() => void>()}
        updateTabTitle={vi.fn<() => void>()}
        mobile
        allowSplit={false}
      />,
    );

    expect(state.surfaceProps.get(tabA.id)).toMatchObject({
      preferDomRenderer: true,
      resizeTerminalOnFit: true,
      suppressTouchKeyboard: true,
      themeBackgroundVar: "--background",
      touchScrollEnabled: true,
    });
  });
});
