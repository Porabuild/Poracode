import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectLocation, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ChatPane } from "../../thread/ChatPane/ChatPane";
import type { ChatTimelineEntry } from "../../thread/ChatPane/chatPaneSelectors";
import { ItemMarkdown } from "../../thread/ChatPane/parts/items/ItemMarkdown";
import ItemMarkdownInner from "../../thread/ChatPane/parts/items/ItemMarkdownInner";

const { hydrateFileCheckpoints, finalizeFileCheckpoint, rendering, messageListProps } = vi.hoisted(
  () => ({
    hydrateFileCheckpoints: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    finalizeFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    rendering: { lazy: false },
    messageListProps: vi.fn<(props: unknown) => void>(),
  }),
);

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  loadOlderThreadRuntimeItems: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  releaseThreadRuntimeItems: vi.fn<() => void>(),
  retainThreadRuntimeItems: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  hydrateFileCheckpoints,
  finalizeFileCheckpoint,
}));

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredItemMarkdownInner: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise the pending-chunk fallback.
    throw new Promise(() => {});
  },
}));

// Keep the actual ChatPane actions, persisted item projection, Markdown, and
// file editor store. Only remove virtualization and unrelated chat controls.
vi.mock("../../thread/ChatPane/parts/MessageList", () => ({
  MessageList: (props: {
    threadId: string;
    entries: readonly ChatTimelineEntry[];
    canRevertCheckpoints: boolean;
    projectLocation?: ProjectLocation;
  }) => {
    messageListProps(props);
    const items = useAppStore((state) => state.runtimeItemsByIdByThread[props.threadId]);
    const Renderer = rendering.lazy ? ItemMarkdown : ItemMarkdownInner;
    return props.entries.map((entry) => (
      <Renderer key={entry.id} text={items?.[entry.id]?.streams.assistant_text ?? ""} />
    ));
  },
}));

vi.mock("../../thread/ChatPane/ChatScrollControls", () => ({ ChatScrollControls: () => null }));
vi.mock("../../thread/ChatPane/parts/items/SubAgentOverlay", () => ({
  SubAgentOpenController: () => null,
}));
vi.mock("@/renderer/components/find/ChatFindBar", () => ({ ChatFindBar: () => null }));

const outputDirectory = "D:/OneDrive - Institute/Projects/Robotics (Review)/figures/source";
const pdfPath = `${outputDirectory}/workflow_3.pdf`;
const storedResponse = `Created the shorter, aligned layout in :codex-file-citation{path="${outputDirectory}/workflow_3.pptx" purpose="output"}, with matching :codex-file-citation{path="${pdfPath}" purpose="output"}.

:codex-file-citation{path="${outputDirectory}/workflow_2.pptx" purpose="output"} now contains only the original slide. Your wording and colors are preserved.`;
const pdfContent = "JVBERi0xLjcK";
const homeProject: Project = {
  id: HOME_PROJECT_ID,
  name: "Home",
  location: { kind: "windows", path: "C:\\Users\\charl" },
  createdAt: "2026-09-18T00:00:00.000Z",
};
const thread: Thread = {
  id: "home-codex-citation-thread",
  projectId: HOME_PROJECT_ID,
  title: "Presentation output",
  agentKind: "codex",
  config: { model: "gpt-5.4" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

describe("Home Codex file citations through ChatPane", () => {
  beforeEach(() => {
    localStorage.clear();
    useFileEditorStore.getState().clearSession();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      writable: true,
      value: {
        readExternalFile: vi.fn<typeof window.poracode.readExternalFile>().mockResolvedValue({
          path: pdfPath,
          status: "binary",
          contentBase64: pdfContent,
          modifiedAtMs: 42,
        }),
        readProjectFile: vi.fn<typeof window.poracode.readProjectFile>(),
        listProjectTree: vi.fn<typeof window.poracode.listProjectTree>(),
        searchProjectFiles: vi.fn<typeof window.poracode.searchProjectFiles>(),
        dbSetState: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        dbSyncAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    useAppStore.setState({
      projects: [homeProject],
      threads: [thread],
      view: { kind: "home" },
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeCompletedTurnsByThread: {},
      fileCheckpointsByThread: {},
      fileCheckpointTurnsByThread: {},
      provisioningWorktreeThreadIds: {},
      connectingThreadIds: {},
    });
    useAppStore.getState().hydrateThreadRuntimeItems(thread.id, [
      {
        id: "stored-response",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: storedResponse },
      },
    ]);
  });

  it.each(["full Markdown", "lazy fallback"] as const)(
    "opens the stored Windows PDF citation in %s without project operations",
    async (renderer) => {
      rendering.lazy = renderer === "lazy fallback";
      const { container } = render(
        <AppProvider>
          <ChatPane thread={thread} />
        </AppProvider>,
      );

      expect(container).not.toHaveTextContent(":codex-file-citation");
      expect(container).not.toHaveTextContent('purpose="output"');
      expect(container).toHaveTextContent("Your wording and colors are preserved.");
      for (const filename of ["workflow_3.pptx", "workflow_3.pdf", "workflow_2.pptx"]) {
        expect(screen.getByRole("button", { name: filename })).toBeEnabled();
      }
      expect(screen.getByRole("button", { name: "workflow_3.pdf" })).toHaveAttribute(
        "title",
        pdfPath,
      );

      fireEvent.click(screen.getByRole("button", { name: "workflow_3.pdf" }));

      await waitFor(() => {
        expect(window.poracode.readExternalFile).toHaveBeenCalledExactlyOnceWith({
          projectLocation: homeProject.location,
          absolutePath: pdfPath,
        });
        expect(useFileEditorStore.getState().buffers[pdfPath]).toMatchObject({
          path: pdfPath,
          status: "binary",
          binaryContentBase64: pdfContent,
          isDirty: false,
          isLoading: false,
        });
      });
      expect(useFileEditorStore.getState()).toMatchObject({
        rootContext: { projectId: HOME_PROJECT_ID },
        activePath: pdfPath,
        overlayMode: "modal",
      });
      expect(window.poracode.readProjectFile).not.toHaveBeenCalled();
      expect(window.poracode.listProjectTree).not.toHaveBeenCalled();
      expect(window.poracode.searchProjectFiles).not.toHaveBeenCalled();
      expect(hydrateFileCheckpoints).not.toHaveBeenCalled();
      expect(finalizeFileCheckpoint).not.toHaveBeenCalled();
      expect(messageListProps).toHaveBeenLastCalledWith(
        expect.objectContaining({ canRevertCheckpoints: false, projectLocation: undefined }),
      );
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.["stored-response"]?.streams
          .assistant_text,
      ).toBe(storedResponse);
    },
  );
});
