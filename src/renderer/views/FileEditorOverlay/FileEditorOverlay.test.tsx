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

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(main).getByPlaceholderText("Search files")).toBeInTheDocument();
    expect(within(main).queryByTestId("monaco-editor")).not.toBeInTheDocument();
  });
});
