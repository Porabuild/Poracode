import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MarkdownPreview } from "../MarkdownPreview";
import { Editor, type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import {
  useActiveBufferContent,
  useActiveBufferStatus,
  useIsActiveBufferDirty,
  useTabPaths,
} from "@/renderer/state/fileEditorSelectors";
import type { ProjectLocation } from "@/shared/contracts";
import { createLspFileUri } from "@/shared/lsp";
import { getBasename } from "@/shared/pathUtils";
import { getLanguageFromPath, isMarkdownFile } from "./parts/langMap";
import { defineAppThemes, useResolvedTheme } from "./parts/monacoThemes";
import { SortableTab } from "./parts/SortableTab";
import { EditorToolbar } from "./parts/EditorToolbar";
import { useLspSync } from "./parts/useLspSync";
import { useMergeConflictContribution } from "./parts/mergeConflict/useMergeConflictContribution";
import { useGitDiffContribution } from "./parts/gitDiff/useGitDiffContribution";

export { getLanguageFromPath } from "./parts/langMap";

const EDITOR_OPTIONS: MonacoEditor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: "on",
  automaticLayout: true,
  padding: { top: 4, bottom: 4 },
  renderLineHighlightOnlyWhenFocus: true,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
    verticalSliderSize: 8,
    horizontalSliderSize: 8,
  },
  contextmenu: true,
  tabSize: 2,
};

export function FileEditorPane(props: {
  showTabs: boolean;
  headerNeedsTrafficLightPad?: boolean;
  onOpenFullscreen?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const activePath = useFileEditorStore((state) => state.activePath);
  const rootProjectLocation = useFileEditorStore(
    (state) => state.rootContext?.projectLocation ?? null,
  );
  const isDirty = useIsActiveBufferDirty();
  const bufferStatus = useActiveBufferStatus();
  const markdownPreviewPath = useFileEditorStore((state) => state.markdownPreviewPath);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const theme = useResolvedTheme();

  const [showPreview, setShowPreview] = useState(false);

  const isMarkdown = activePath ? isMarkdownFile(activePath) : false;

  const { notifyDidSave } = useLspSync({ monaco: monacoInstance, activePath, bufferStatus });

  useEffect(() => {
    setShowPreview(!!activePath && isMarkdown && markdownPreviewPath === activePath);
  }, [activePath, isMarkdown, markdownPreviewPath]);

  async function handleSave(path: string) {
    try {
      await useFileEditorStore.getState().saveFile(path);
      notifyDidSave(path);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error));
    }
  }

  function handleCloseTab(path: string) {
    const store = useFileEditorStore.getState();
    const tabBuffer = store.buffers[path];
    if (tabBuffer?.status === "ready" && tabBuffer.isDirty) {
      if (!window.confirm(t`Discard unsaved changes in ${path}?`)) {
        return;
      }
      store.discardFileChanges(path);
    }
    store.closeTab(path);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        const path = useFileEditorStore.getState().activePath;
        if (path) {
          e.preventDefault();
          handleCloseTab(path);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && showPreview) {
        const path = useFileEditorStore.getState().activePath;
        if (path) {
          e.preventDefault();
          void handleSave(path);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const monacoTheme = theme === "dark" ? "lightcode-dark" : "lightcode-light";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {props.showTabs ? (
        <TabStripHeader
          isDirty={isDirty}
          isMarkdown={isMarkdown}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          activePath={activePath}
          headerNeedsTrafficLightPad={props.headerNeedsTrafficLightPad ?? false}
          onSave={handleSave}
          handleCloseTab={handleCloseTab}
          {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
          {...(props.onClose ? { onClose: props.onClose } : {})}
        />
      ) : null}

      {activePath && bufferStatus ? (
        <>
          {!props.showTabs ? (
            <div
              className={`flex shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] px-3 ${
                props.headerNeedsTrafficLightPad ? macosTrafficLightPadClass : ""
              }`}
              style={{ height: "env(titlebar-area-height, 32px)" }}
            >
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {getBasename(activePath)}
                {isDirty ? " *" : ""}
              </span>
              <div className="flex-1" />
              <EditorToolbar
                isMarkdown={isMarkdown}
                showPreview={showPreview}
                setShowPreview={setShowPreview}
                isDirty={isDirty}
                activePath={activePath}
                onSave={() => void handleSave(activePath)}
                {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
                {...(props.onClose ? { onClose: props.onClose } : {})}
              />
            </div>
          ) : null}

          <EditorBody
            activePath={activePath}
            projectLocation={rootProjectLocation}
            bufferStatus={bufferStatus}
            monacoTheme={monacoTheme}
            onMonacoReady={setMonacoInstance}
            showPreview={showPreview}
            isMarkdown={isMarkdown}
            onSave={handleSave}
          />
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
          <Trans>Select a file to start editing.</Trans>
        </div>
      )}
    </div>
  );
}

function TabStripHeader(props: {
  isDirty: boolean;
  isMarkdown: boolean;
  showPreview: boolean;
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>;
  activePath: string | null;
  headerNeedsTrafficLightPad: boolean;
  onSave: (path: string) => void;
  handleCloseTab: (path: string) => void;
  onOpenFullscreen?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const paths = useTabPaths();
  if (paths.length === 0) return null;

  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 border-b border-[color:var(--border)] pl-1 pr-3 ${
        props.headerNeedsTrafficLightPad ? macosTrafficLightPadClass : ""
      }`}
      style={{ height: "env(titlebar-area-height, 32px)" }}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        role="tablist"
        aria-label={t`Editor tabs`}
      >
        {paths.map((path, index) => (
          <SortableTab
            key={path}
            path={path}
            index={index}
            onSelect={() => useFileEditorStore.getState().setActivePath(path)}
            onClose={() => props.handleCloseTab(path)}
            onDoubleClick={() => useFileEditorStore.getState().pinTab(path)}
          />
        ))}
      </div>

      <div className="flex-1" />
      <EditorToolbar
        isMarkdown={props.isMarkdown}
        showPreview={props.showPreview}
        setShowPreview={props.setShowPreview}
        isDirty={props.isDirty}
        activePath={props.activePath}
        onSave={() => props.activePath && props.onSave(props.activePath)}
        {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
        {...(props.onClose ? { onClose: props.onClose } : {})}
      />
    </div>
  );
}

function EditorBody(props: {
  activePath: string;
  projectLocation: ProjectLocation | null;
  bufferStatus: NonNullable<ReturnType<typeof useActiveBufferStatus>>;
  monacoTheme: string;
  onMonacoReady: (monaco: Monaco) => void;
  showPreview: boolean;
  isMarkdown: boolean;
  onSave: (path: string) => void;
}) {
  const { activePath, projectLocation, bufferStatus, monacoTheme, showPreview, isMarkdown } = props;
  const content = useActiveBufferContent();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const [editorState, setEditorState] = useState<{
    path: string;
    editor: MonacoEditor.IStandaloneCodeEditor;
    monaco: Monaco;
  } | null>(null);
  const editorInstance = editorState?.path === activePath ? editorState.editor : null;
  const monacoInstance = editorState?.path === activePath ? editorState.monaco : null;
  const pendingReveal = useFileEditorStore((state) => state.pendingReveal);
  const gitDiff = useFileEditorStore((state) => {
    const path = state.activePath;
    if (!path) return null;
    const buffer = state.buffers[path];
    return buffer?.status === "ready" ? (buffer.gitDiff ?? null) : null;
  });

  useMergeConflictContribution({ editor: editorInstance, monaco: monacoInstance });
  useGitDiffContribution({ editor: editorInstance, gitDiff, bufferStatus });

  useEffect(() => {
    if (!pendingReveal || !editorInstance) return;
    if (pendingReveal.path !== activePath) return;
    if (bufferStatus !== "ready") return;
    const { lineNumber, token } = pendingReveal;
    editorInstance.revealLineInCenter(lineNumber);
    editorInstance.setPosition({ lineNumber, column: 1 });
    editorInstance.focus();
    useFileEditorStore.getState().consumeReveal(token);
  }, [pendingReveal, editorInstance, activePath, bufferStatus]);

  const handleBeforeMount: BeforeMount = (monaco) => {
    defineAppThemes(monaco);
  };

  function registerSaveCommand(editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) {
    // eslint-disable-next-line no-bitwise -- Monaco uses bitmask key combos
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const path = useFileEditorStore.getState().activePath;
      if (path) props.onSave(path);
    });
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    props.onMonacoReady(monaco);
    setEditorState({ path: activePath, editor, monaco });
    registerSaveCommand(editor, monaco);
  };

  const modelPath = projectLocation ? createLspFileUri(projectLocation, activePath) : activePath;

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {bufferStatus === "ready" && showPreview && isMarkdown ? (
        <MarkdownPreview content={content ?? ""} />
      ) : bufferStatus === "ready" ? (
        <Editor
          path={modelPath}
          language={getLanguageFromPath(activePath)}
          theme={monacoTheme}
          value={content ?? ""}
          onChange={(value) => {
            if (value !== undefined) useFileEditorStore.getState().updateBuffer(activePath, value);
          }}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          options={EDITOR_OPTIONS}
          loading={
            <div className="flex h-full items-center justify-center text-sm text-muted">
              <Trans>Loading editor…</Trans>
            </div>
          }
        />
      ) : (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
          {bufferStatus === "binary" ? (
            <Trans>Binary files can't be edited here.</Trans>
          ) : bufferStatus === "too_large" ? (
            <Trans>This file is too large for the built-in editor.</Trans>
          ) : (
            <Trans>This file uses an unsupported encoding.</Trans>
          )}
        </div>
      )}
    </div>
  );
}
