// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
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
});
