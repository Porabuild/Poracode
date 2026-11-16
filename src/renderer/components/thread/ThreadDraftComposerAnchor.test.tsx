import "@/renderer/testUtils/clientDraftDatabase";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { AgentStatus, Project } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

vi.mock("@/renderer/components/newsLine/NewsLine", () => ({
  NewsLine: () => <div data-testid="news-line" />,
}));

vi.mock("./ThreadComposer", () => ({
  ThreadComposer: () => (
    <div data-poracode-composer="">
      <div data-composer-input-anchor="" />
    </div>
  ),
}));

import "@/renderer/components/providers/bootstrap";
import { ThreadDraftView } from "./ThreadDraftView";

const localProject: Project = {
  id: "local-project",
  name: "Repo",
  location: {
    kind: "windows",
    path: "C:\\repo",
  },
  createdAt: "2026-03-28T00:00:00.000Z",
};

const remoteProject: Project = {
  ...localProject,
  id: "remote-project",
  remoteServerId: "desktop-1",
};

const geminiStatus: AgentStatus = {
  kind: "gemini",
  label: "Gemini",
  installed: true,
  authState: "authenticated",
  capabilities: {
    models: [{ id: "auto", label: "Auto" }],
    efforts: [],
    modelEfforts: {},
    modes: ["agent"],
    approvalPolicies: [],
    sandboxModes: [],
    supportsResume: true,
    supportsDirectInput: true,
    liveInputMode: "server",
    presentationMode: "gui",
    settingDefs: [],
  },
};

function installLayoutHarness(initial: {
  containerHeight: number;
  blockHeight: number;
  aboveInput: number;
  verticalPadding?: number;
}) {
  let containerHeight = initial.containerHeight;
  let blockHeight = initial.blockHeight;
  let aboveInput = initial.aboveInput;
  const verticalPadding = initial.verticalPadding ?? 0;

  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalResizeObserver = globalThis.ResizeObserver;

  const observers = new Set<{
    instance: ResizeObserver;
    callback: ResizeObserverCallback;
    targets: Set<Element>;
    isAnchorObserver: boolean;
  }>();

  class MockResizeObserver implements ResizeObserver {
    private readonly record: {
      instance: ResizeObserver;
      callback: ResizeObserverCallback;
      targets: Set<Element>;
      isAnchorObserver: boolean;
    };

    constructor(callback: ResizeObserverCallback) {
      this.record = { instance: this, callback, targets: new Set(), isAnchorObserver: false };
      observers.add(this.record);
    }

    observe(target: Element) {
      if (target instanceof HTMLElement && (isContainer(target) || isBlock(target))) {
        this.record.isAnchorObserver = true;
      }
      this.record.targets.add(target);
    }

    unobserve(target: Element) {
      this.record.targets.delete(target);
    }

    disconnect() {
      this.record.targets.clear();
      observers.delete(this.record);
    }
  }

  globalThis.ResizeObserver = MockResizeObserver;

  const isContainer = (el: HTMLElement) => el.hasAttribute("data-draft-body");
  const isSpacer = (el: HTMLElement) => el.hasAttribute("data-draft-composer-anchor-spacer");
  const isBlock = (el: HTMLElement) => el.hasAttribute("data-draft-composer-block");
  const isInputAnchor = (el: HTMLElement) => el.hasAttribute("data-composer-input-anchor");

  const spacerHeightOf = (container: HTMLElement | null) => {
    const spacer = container?.querySelector<HTMLElement>("[data-draft-composer-anchor-spacer]");
    return spacer ? Number.parseInt(spacer.style.height, 10) || 0 : 0;
  };

  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return isContainer(this) ? containerHeight : 0;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      if (isBlock(this)) return blockHeight;
      if (isSpacer(this)) return Number.parseInt(this.style.height, 10) || 0;
      return 0;
    },
  });

  HTMLElement.prototype.getBoundingClientRect = function () {
    const containerTop = 40;
    const containerPaddingTop = verticalPadding / 2 || 8;
    let top = 0;
    if (isContainer(this)) {
      top = containerTop;
    } else if (isBlock(this)) {
      const container = this.closest<HTMLElement>("[data-draft-body]");
      top = containerTop + containerPaddingTop + spacerHeightOf(container);
    } else if (isInputAnchor(this)) {
      const container = this.closest<HTMLElement>("[data-draft-body]");
      top = containerTop + containerPaddingTop + spacerHeightOf(container) + aboveInput;
    }
    return {
      x: 0,
      y: top,
      top,
      right: 720,
      bottom: top,
      left: 0,
      width: 720,
      height: 0,
      toJSON: () => ({}),
    };
  };

  globalThis.getComputedStyle = ((el: Element, pseudoElt?: string | null) => {
    const style = originalGetComputedStyle(el, pseudoElt);
    if (!(el instanceof HTMLElement) || !isContainer(el) || verticalPadding === 0) {
      return style;
    }
    const pad = `${verticalPadding / 2}px`;
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "paddingTop" || prop === "paddingBottom") return pad;
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof globalThis.getComputedStyle;

  return {
    setMetrics(
      next: Partial<{ containerHeight: number; blockHeight: number; aboveInput: number }>,
    ) {
      if (next.containerHeight !== undefined) containerHeight = next.containerHeight;
      if (next.blockHeight !== undefined) blockHeight = next.blockHeight;
      if (next.aboveInput !== undefined) aboveInput = next.aboveInput;
    },
    triggerResize(target: Element) {
      for (const observer of [...observers]) {
        if (observer.targets.has(target)) {
          observer.callback([{ target } as ResizeObserverEntry], observer.instance);
        }
      }
    },
    activeObserverCount() {
      return [...observers].filter((observer) => observer.isAnchorObserver).length;
    },
    cleanup() {
      if (originalClientHeight) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
      }
      if (originalOffsetHeight) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
      }
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      globalThis.getComputedStyle = originalGetComputedStyle;
      globalThis.ResizeObserver = originalResizeObserver;
    },
  };
}

function getSpacer(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-draft-composer-anchor-spacer]");
  expect(el).not.toBeNull();
  if (!el) throw new Error("Missing [data-draft-composer-anchor-spacer]");
  return el;
}

function getBlock(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-draft-composer-block]");
  expect(el).not.toBeNull();
  if (!el) throw new Error("Missing [data-draft-composer-block]");
  return el;
}

function getBody(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-draft-body]");
  expect(el).not.toBeNull();
  if (!el) throw new Error("Missing [data-draft-body]");
  return el;
}

function resetStores() {
  useAgentStatusesStore.setState({
    agentStatuses: [],
    wslAgentStatuses: [],
    windowsLoaded: false,
    wslLoaded: false,
    inFirstLaunchDiscovery: false,
    discoveryScope: undefined,
    discoveredAgents: [],
  });
  useSharedSettings.setState({
    providerConfigs: {},
    providerModelPreferences: {},
    crews: [],
    agentSettings: {},
    hiddenModels: {},
    disabledAgents: [],
    lastPresentationModeByAgent: {},
    enabledMcpServers: {},
    disabledBuiltInMcpServers: {},
    newsLineEnabled: false,
    sharedSettingsHydrated: true,
  });
  useAppStore.setState({
    pendingDraftWorktreeSelections: {},
    draftVisit: 0,
    draftContents: {},
    draftContentDiscardRequests: {},
  });
  useRemoteServersStore.setState({
    servers: [],
    runtime: {},
    hostUpdates: {},
    hostUpdateRestarts: {},
  });
}

function seedRemoteServer(status: "online" | "connecting" | "offline") {
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "desktop-1",
        label: "MacBook",
        endpoint: "http://remote-anchor.test/",
        accessToken: "token",
        scopes: [],
      },
    ],
    runtime: {
      "desktop-1": {
        status,
        projects: [],
        threads: [],
      },
    },
    hostUpdates: {},
    hostUpdateRestarts: {},
  });
}

describe("ThreadDraftView stable composer anchor", () => {
  let restoreLayout: (() => void) | undefined;

  beforeEach(() => {
    resetStores();
    vi.spyOn(useRemoteServersStore.getState(), "loadAgentSlashCommands").mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetStores();
    restoreLayout?.();
    restoreLayout = undefined;
  });

  it("re-anchors the draft composer after a remote host reconnects while selectedAgent stays cached", () => {
    const harness = installLayoutHarness({
      containerHeight: 800,
      blockHeight: 160,
      aboveInput: 36,
    });
    restoreLayout = harness.cleanup;

    seedRemoteServer("online");

    const { container, unmount } = render(
      <ThreadDraftView project={remoteProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );

    expect(getSpacer(container).style.height).toBe("312px");
    expect(harness.activeObserverCount()).toBe(1);

    // Remote host drops to connecting (for example, sleep/network blip) while cached statuses stay present.
    act(() => {
      seedRemoteServer("connecting");
    });
    expect(container.querySelector("[data-draft-composer-anchor-spacer]")).toBeNull();
    expect(harness.activeObserverCount()).toBe(0);

    // Host comes back online: the newly mounted spacer must anchor synchronously before paint, not stay at 0px.
    act(() => {
      seedRemoteServer("online");
    });
    expect(getSpacer(container).style.height).toBe("312px");
    expect(harness.activeObserverCount()).toBe(1);

    // ResizeObserver must track growth above the input and shrinkage back to baseline on the new block.
    const block = getBlock(container);
    act(() => {
      harness.setMetrics({ blockHeight: 260, aboveInput: 136 });
      harness.triggerResize(block);
    });
    expect(getSpacer(container).style.height).toBe("212px");

    act(() => {
      harness.setMetrics({ blockHeight: 160, aboveInput: 36 });
      harness.triggerResize(block);
    });
    expect(getSpacer(container).style.height).toBe("312px");

    unmount();
    expect(harness.activeObserverCount()).toBe(0);
  });

  it("anchors the draft composer when initially mounted while remote host is connecting with cached agents", () => {
    const harness = installLayoutHarness({
      containerHeight: 800,
      blockHeight: 160,
      aboveInput: 36,
    });
    restoreLayout = harness.cleanup;

    seedRemoteServer("connecting");

    const { container } = render(
      <ThreadDraftView project={remoteProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );
    expect(container.querySelector("[data-draft-composer-anchor-spacer]")).toBeNull();
    expect(harness.activeObserverCount()).toBe(0);

    act(() => {
      seedRemoteServer("online");
    });
    expect(getSpacer(container).style.height).toBe("312px");
    expect(harness.activeObserverCount()).toBe(1);
  });

  it("does not lock the composer at the top when initially mounted in a cramped container", () => {
    const harness = installLayoutHarness({
      containerHeight: 120,
      blockHeight: 160,
      aboveInput: 36,
    });
    restoreLayout = harness.cleanup;

    const { container } = render(
      <ThreadDraftView project={localProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );

    const spacer = getSpacer(container);
    expect(spacer.style.height).toBe("8px");

    const body = getBody(container);
    act(() => {
      harness.setMetrics({ containerHeight: 800 });
      harness.triggerResize(body);
    });

    expect(spacer.style.height).toBe("312px");
  });

  it("resets the captured anchor ratio if selectedAgent disappears and later recovers", () => {
    const harness = installLayoutHarness({
      containerHeight: 800,
      blockHeight: 160,
      aboveInput: 36,
    });
    restoreLayout = harness.cleanup;

    const { container, rerender } = render(
      <ThreadDraftView project={localProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );
    expect(getSpacer(container).style.height).toBe("312px");

    rerender(<ThreadDraftView project={localProject} agentStatuses={[]} onStart={() => {}} />);
    expect(container.querySelector("[data-draft-composer-anchor-spacer]")).toBeNull();

    // Recover with a taller composer block; it should re-center cleanly around the new block height.
    harness.setMetrics({ blockHeight: 240, aboveInput: 36 });
    rerender(
      <ThreadDraftView project={localProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );
    expect(getSpacer(container).style.height).toBe("272px");
  });

  it("subtracts container vertical padding from maxSpacer so tall prompts do not overflow", () => {
    const harness = installLayoutHarness({
      containerHeight: 400,
      blockHeight: 160,
      aboveInput: 36,
      verticalPadding: 16,
    });
    restoreLayout = harness.cleanup;

    const { container } = render(
      <ThreadDraftView project={localProject} agentStatuses={[geminiStatus]} onStart={() => {}} />,
    );
    expect(getSpacer(container).style.height).toBe("112px");

    // Prompt grows downward to 320px; maxSpacer = 400 - 16 - 320 = 64px (not 80px).
    const block = getBlock(container);
    act(() => {
      harness.setMetrics({ blockHeight: 320, aboveInput: 36 });
      harness.triggerResize(block);
    });
    expect(getSpacer(container).style.height).toBe("64px");
  });
});
