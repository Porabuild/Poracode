import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ProjectTreeView } from "./ProjectTreeView";

const tree = vi.hoisted(() => ({
  searchQuery: "",
  setSearchQuery: vi.fn<() => void>(),
  searchResults: [],
  searchLoading: false,
  draft: null,
  setDraft: vi.fn<() => void>(),
  toggleDirectory: vi.fn<() => void>(),
  handleSelectFile: vi.fn<() => void>(),
  handleCreateEntry: vi.fn<() => void>(),
  handleRenameEntry: vi.fn<() => void>(),
  handleMovePath: vi.fn<() => void>(),
  handleEntryAction: vi.fn<() => void>(),
  handleRootAction: vi.fn<() => void>(),
  openSearchResult: vi.fn<() => void>(),
}));

vi.mock("./parts/useProjectTree", () => ({
  useProjectTree: () => tree,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
  }),
}));

vi.mock("@/renderer/hooks/useScrollFade", () => ({
  useScrollFade: () => ({
    setScrollContainer: vi.fn<() => void>(),
    scrollRef: { current: null },
    scrollFadeStyle: {},
  }),
}));

vi.mock("@/renderer/components/common", () => ({
  ContextMenu: (props: { children: ReactNode }) => props.children,
  PixelLoader: () => null,
}));

const rootContext = {
  projectId: "project-1",
  projectName: "Poracode",
  projectLocation: { kind: "posix" as const, path: "/repo" },
  rootLabel: "Poracode",
};

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");

function installVisualViewport() {
  const resizeListeners = new Set<EventListener>();
  const viewport = {
    height: 900,
    offsetTop: 0,
    pageTop: 0,
    width: 440,
    scale: 1,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === "resize") resizeListeners.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === "resize") resizeListeners.delete(listener);
    },
    dispatchResize: () => {
      const event = new Event("resize");
      for (const listener of resizeListeners) listener(event);
    },
  };
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  return viewport;
}

function renderCompactTree() {
  render(
    <>
      <MobilePageBottomBar>
        <span>Tabs</span>
      </MobilePageBottomBar>
      <ProjectTreeView
        rootContext={rootContext}
        onSelectFile={() => {}}
        compact
        compactActionsVisible
      />
    </>,
  );
}

describe("ProjectTreeView compact search", () => {
  beforeEach(() => {
    tree.setSearchQuery.mockReset();
    useProjectTreeStore.getState().resetForRoot("project-1:");
  });

  afterEach(() => {
    if (originalVisualViewport) {
      Object.defineProperty(window, "visualViewport", originalVisualViewport);
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
    if (originalInnerHeight) Object.defineProperty(window, "innerHeight", originalInnerHeight);
  });

  it("closes and clears search when the input blurs", async () => {
    renderCompactTree();
    fireEvent.click(screen.getByRole("button", { name: "Search files" }));

    const input = screen.getByPlaceholderText("Search files");
    fireEvent.blur(input);

    await waitFor(() => expect(screen.queryByPlaceholderText("Search files")).toBeNull());
    expect(tree.setSearchQuery).toHaveBeenCalledWith("");
  });

  it("closes and clears search when iOS hides the keyboard without blurring", async () => {
    const viewport = installVisualViewport();
    renderCompactTree();
    fireEvent.click(screen.getByRole("button", { name: "Search files" }));

    act(() => {
      viewport.height = 500;
      viewport.dispatchResize();
    });
    act(() => {
      viewport.height = 900;
      viewport.dispatchResize();
    });

    await waitFor(() => expect(screen.queryByPlaceholderText("Search files")).toBeNull());
    expect(tree.setSearchQuery).toHaveBeenCalledWith("");
  });
});
