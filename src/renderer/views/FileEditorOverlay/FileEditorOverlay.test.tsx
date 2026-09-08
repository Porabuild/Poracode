// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { buildCommandRegistry } from "@/renderer/commands/registry";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";

const layout = vi.hoisted(() => ({ compact: false }));

const bridge = vi.hoisted(() => ({
  listProjectTree: vi.fn<() => Promise<{ directoryPath: string; entries: unknown[] }>>(),
  searchProjectTree: vi.fn<() => Promise<{ entries: unknown[] }>>(),
  readProjectFile: vi.fn<() => Promise<unknown>>(),
  writeProjectFile: vi.fn<() => Promise<{ modifiedAtMs: number }>>(),
}));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

vi.mock("@monaco-editor/react", () => ({
  Editor: () => <div data-testid="monaco-editor" />,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        key: index,
        start: index * 24,
        size: 24,
        end: index * 24 + 24,
      })),
    getTotalSize: () => opts.count * 24,
    measureElement: () => undefined,
  }),
}));

import { FileEditorOverlay } from "./FileEditorOverlay";

const rootContext = {
  projectId: "project-1",
  projectName: "Poracode",
  projectLocation: { kind: "windows" as const, path: "C:\\repo" },
  rootLabel: "Poracode",
};

describe("FileEditorOverlay", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn<() => void>();
    layout.compact = false;
    bridge.listProjectTree.mockReset().mockResolvedValue({
      directoryPath: "",
      entries: [{ name: "README.md", path: "README.md", type: "file" }],
    });
    bridge.searchProjectTree.mockReset().mockResolvedValue({ entries: [] });
    bridge.readProjectFile.mockReset().mockResolvedValue({
      path: "README.md",
      status: "ready",
      content: "# Hello",
      modifiedAtMs: 1,
      lineEnding: "lf",
      hasBom: false,
    });
    bridge.writeProjectFile.mockReset().mockResolvedValue({ modifiedAtMs: 2 });
    useFileEditorStore.setState({
      rootContext,
      overlayMode: "fullscreen",
      tabs: [],
      activePath: null,
      previewTab: null,
      markdownPreviewPath: null,
      buffers: {},
      refreshToken: 0,
      pendingReveal: null,
    });
    useProjectTreeStore.getState().resetForRoot("project-1:");
  });

  it("navigates the project tree and editor as compact pages", async () => {
    layout.compact = true;

    render(<FileEditorOverlay onClose={() => {}} />);

    const main = screen.getByRole("main");
    expect(within(main).getByPlaceholderText("Search files")).toBeInTheDocument();
    expect(within(main).queryByTestId("monaco-editor")).not.toBeInTheDocument();
    expect(await within(main).findByText("README.md")).toBeInTheDocument();

    fireEvent.click(within(main).getByText("README.md"));
    await waitFor(() => {
      expect(within(main).getByTestId("monaco-editor")).toBeInTheDocument();
    });
    expect(within(main).queryByPlaceholderText("Search files")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Editor tabs" })).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save.closest("[data-poracode-mobile-page-header-actions]")).not.toBeNull();
    expect(save).toBeDisabled();

    const preview = screen.getByRole("button", { name: "Show preview" });
    expect(preview.closest('[data-poracode-mobile-page-bottom-action$=":left"]')).not.toBeNull();
    fireEvent.click(preview);
    expect(screen.getByRole("button", { name: "Show source" })).toBeInTheDocument();

    useFileEditorStore.getState().updateBuffer("README.md", "# Updated");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(bridge.writeProjectFile).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(main).getByPlaceholderText("Search files")).toBeInTheDocument();
    expect(within(main).queryByTestId("monaco-editor")).not.toBeInTheDocument();
  });

  it("drives the markdown preview toggle through the store shared with the keybinding", async () => {
    const view = render(<FileEditorOverlay onClose={() => {}} />);

    // Desktop layout: the project tree sits in the sidebar, outside `main`.
    fireEvent.click(screen.getByText("README.md"));
    await waitFor(() => {
      expect(screen.getByTestId("monaco-editor")).toBeInTheDocument();
    });

    // The toolbar eye button writes the same store flag the command toggles.
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(useFileEditorStore.getState().markdownPreviewPath).toBe("README.md");
    expect(screen.getByRole("button", { name: "Show source" })).toBeInTheDocument();

    // Running editor.toggle-markdown-preview — what the Ctrl+Shift+V binding
    // dispatches — flips the shared flag back, and the button follows it.
    const command = buildCommandRegistry().find(
      (item) => item.id === "editor.toggle-markdown-preview",
    );
    expect(command).toBeDefined();
    act(() => {
      void command?.run();
    });

    expect(useFileEditorStore.getState().markdownPreviewPath).toBeNull();
    expect(screen.getByRole("button", { name: "Show preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show source" })).not.toBeInTheDocument();

    // A fresh mount derives from the store instead of restarting locally, so
    // the preview survives unmount/remount and the first toggle still flips.
    act(() => {
      void command?.run();
    });
    view.unmount();
    render(<FileEditorOverlay onClose={() => {}} />);

    expect(useFileEditorStore.getState().markdownPreviewPath).toBe("README.md");
    expect(screen.getByRole("button", { name: "Show source" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show source" }));
    expect(useFileEditorStore.getState().markdownPreviewPath).toBeNull();
    expect(screen.getByRole("button", { name: "Show preview" })).toBeInTheDocument();
  });
});
