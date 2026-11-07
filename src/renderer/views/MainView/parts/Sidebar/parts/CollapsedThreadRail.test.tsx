import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useAppStore } from "@/renderer/state/appStore";
import { useAuxiliaryThreadWindows } from "@/renderer/state/auxiliaryThreadWindows";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { CollapsedThreadRail } from "./CollapsedThreadRail";

const { openThread, unloadThread } = vi.hoisted(() => ({
  openThread: vi.fn<(threadId: string) => void>(),
  unloadThread: vi.fn<(threadId: string) => void>(),
}));
vi.mock("@/renderer/actions/threadActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/actions/threadActions")>()),
  openThread,
  unloadThread,
}));

let height = 100;
let notifyResize: () => void;
const originalResizeObserver = globalThis.ResizeObserver;

function makeThread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "codex",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  height = 100;
  openThread.mockClear();
  unloadThread.mockClear();
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => height);
  globalThis.ResizeObserver = class {
    constructor(readonly callback: () => void) {}
    observe(target: Element) {
      if (target.classList.contains("min-h-8")) notifyResize = this.callback;
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  useAppStore.setState({
    projects: [
      {
        id: "project-1",
        name: "Project",
        location: { kind: "windows", path: "C:\\repo" },
        createdAt: "2026-10-18T00:00:00.000Z",
      },
    ],
    threads: [1, 2, 3, 4, 5].map((n) => makeThread(`thread-${n}`)),
    view: { kind: "home" },
  });
  useAuxiliaryThreadWindows.setState({ hiddenThreadIds: new Set() });
  usePanelStore.setState({ threadListLayout: "flat" });
  useSharedSettings.setState({ homeScopeEnabled: false, workspaces: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("CollapsedThreadRail", () => {
  it("reserves a full slot for overflow and updates when the rail resizes", () => {
    render(<CollapsedThreadRail />);
    expect(screen.getByRole("button", { name: "thread-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "thread-2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "thread-3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toHaveTextContent("+3");
    act(() => {
      height = 168;
      notifyResize();
    });
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "thread-5" })).toBeInTheDocument();
    act(() => {
      height = 66;
      notifyResize();
    });
    expect(screen.getByRole("button", { name: "More" })).toHaveTextContent("+4");
    expect(screen.queryByRole("button", { name: "thread-2" })).not.toBeInTheDocument();
  });

  it("keeps a chip title accessible by its plain-text name on the icon-only button", () => {
    useAppStore.setState({
      threads: [makeThread("thread-1", { title: "$finalize the release" })],
    });
    const { container } = render(<CollapsedThreadRail />);
    expect(screen.getByRole("button", { name: "$finalize the release" })).toBeInTheDocument();
    expect(container.querySelector(".poracode-slash-chip")).toBeNull();
  });

  it("keeps all threads accessible when only the overflow button fits", async () => {
    height = 32;
    render(<CollapsedThreadRail />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveTextContent("+5");
    fireEvent.click(more);
    const item = await screen.findByRole("button", { name: /thread-5/ });
    fireEvent.click(item);
    expect(openThread).toHaveBeenCalledWith("thread-5");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Threads" })).not.toBeInTheDocument(),
    );
  });

  it("marks the overflow when it contains an open thread and supports keyboard selection", async () => {
    useAppStore.setState({ view: { kind: "thread", panes: ["thread-5"] } });
    render(<CollapsedThreadRail />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveClass("bg-[var(--row-active)]");
    more.focus();
    fireEvent.keyDown(more, { key: "Enter" });
    fireEvent.keyUp(more, { key: "Enter" });
    const item = await screen.findByRole("button", { name: /thread-5/ });
    expect(item).toHaveAttribute("aria-current", "page");
    item.focus();
    fireEvent.keyDown(item, { key: "Enter" });
    fireEvent.keyUp(item, { key: "Enter" });
    expect(openThread).toHaveBeenCalledWith("thread-5");
  });

  it("preserves right-click actions for overflowed threads", async () => {
    render(<CollapsedThreadRail />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const item = await screen.findByRole("button", { name: /thread-5/ });
    fireEvent.contextMenu(item);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unload Thread" }));
    expect(unloadThread).toHaveBeenCalledWith("thread-5");
    expect(openThread).not.toHaveBeenCalled();
  });

  it("closes overflow when everything fits and keeps it closed after shrinking", async () => {
    render(<CollapsedThreadRail />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("dialog", { name: "Threads" })).toBeInTheDocument();
    act(() => {
      height = 168;
      notifyResize();
    });
    expect(screen.queryByRole("dialog", { name: "Threads" })).not.toBeInTheDocument();
    act(() => {
      height = 100;
      notifyResize();
    });
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Threads" })).not.toBeInTheDocument();
  });

  it("excludes inactive, done, archived, detached, and disabled Home threads", () => {
    useAppStore.setState({
      threads: [
        makeThread("visible"),
        makeThread("inactive", { status: "inactive" }),
        makeThread("done", { done: true }),
        makeThread("archived", { archived: true }),
        makeThread("detached"),
        makeThread("home", { projectId: HOME_PROJECT_ID }),
      ],
    });
    useAuxiliaryThreadWindows.setState({ hiddenThreadIds: new Set(["detached"]) });
    render(<CollapsedThreadRail />);
    expect(screen.getByRole("button", { name: "visible" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").filter((el) => el.tagName === "BUTTON")).toHaveLength(1);
  });
});
