import { lazy, Suspense, useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { BeforeMount, Monaco, OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { MarkdownPreview } from "../../MarkdownPreview";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import {
  useActiveBufferContent,
  useActiveBufferStatus,
} from "@/renderer/state/fileEditorSelectors";
import type { ProjectLocation } from "@/shared/contracts";
import { createLspFileUri } from "@/shared/lsp";
import { getLanguageFromPath } from "./langMap";
import { defineAppThemes } from "./monacoThemes";
import { useMergeConflictContribution } from "./mergeConflict/useMergeConflictContribution";
import { useGitDiffContribution } from "./gitDiff/useGitDiffContribution";
import {
  clearActiveFindEditor,
  setActiveFindEditor,
} from "@/renderer/components/find/editorFindBridge";
import { useEditorModelBinding } from "./useEditorModelBinding";
import { useLspSync } from "./useLspSync";
import { openPdfPreview } from "@/renderer/components/pdf";
import { EditorMediaViews } from "./EditorMediaViews";
import { SvgFileView } from "@/renderer/components/media/SvgFileView";
import { fileMediaType, isSvgFile } from "@/shared/fileMedia";
import { isPdfPath } from "@/shared/promptContent";

const LocalMonacoEditor = lazy(() => import("./localMonacoEditor"));

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

export function EditorBody(props: {
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
  const modelPath = projectLocation ? createLspFileUri(projectLocation, activePath) : activePath;
  const isPdf = isPdfPath(activePath);
  const editingSource =
    bufferStatus === "ready" &&
    !isPdf &&
    !fileMediaType(activePath) &&
    !(showPreview && isMarkdown);
  const { binding, bindEditor } = useEditorModelBinding(editingSource ? modelPath : null, {
    disposeModelOnRelease: true,
  });
  const editorInstance = binding?.editor ?? null;
  const monacoInstance = binding?.monaco ?? null;
  const model = binding?.model ?? null;
  useLspSync({ monaco: monacoInstance, model, activePath, bufferStatus });
  const pendingReveal = useFileEditorStore((state) => state.pendingReveal);
  const gitDiff = useFileEditorStore((state) => {
    const path = state.activePath;
    if (!path) return null;
    const buffer = state.buffers[path];
    return buffer?.status === "ready" ? (buffer.gitDiff ?? null) : null;
  });
  useMergeConflictContribution({ editor: editorInstance, monaco: monacoInstance, model });
  useGitDiffContribution({ editor: editorInstance, gitDiff, bufferStatus, model });

  // Register this editor as the Find target while it's focused so the global
  // Find command (Ctrl+F) can open Monaco's built-in find widget on it.
  useEffect(() => {
    if (!editorInstance) return;
    setActiveFindEditor(editorInstance);
    const focusSub = editorInstance.onDidFocusEditorText(() => setActiveFindEditor(editorInstance));
    return () => {
      focusSub.dispose();
      clearActiveFindEditor(editorInstance);
    };
  }, [editorInstance]);

  useEffect(() => {
    if (
      !pendingReveal ||
      !editorInstance ||
      !model ||
      model.isDisposed() ||
      editorInstance.getModel() !== model
    )
      return;
    if (pendingReveal.path !== activePath) return;
    if (bufferStatus !== "ready") return;
    const { lineNumber, token } = pendingReveal;
    editorInstance.revealLineInCenter(lineNumber);
    editorInstance.setPosition({ lineNumber, column: 1 });
    editorInstance.focus();
    useFileEditorStore.getState().consumeReveal(token);
  }, [pendingReveal, editorInstance, model, activePath, bufferStatus]);

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
    props.onMonacoReady(monaco);
    bindEditor(editor, monaco);
    registerSaveCommand(editor, monaco);
  };

  const loading = (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      {fileMediaType(activePath) ? (
        <Trans>Loading media preview…</Trans>
      ) : (
        <Trans>Loading editor…</Trans>
      )}
    </div>
  );

  const fallback = (
    <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">
      {bufferStatus === "binary" ? (
        <Trans>Binary files can't be edited here.</Trans>
      ) : bufferStatus === "too_large" ? (
        <Trans>This file is too large for the built-in editor.</Trans>
      ) : (
        <Trans>This file uses an unsupported encoding.</Trans>
      )}
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {bufferStatus === "loading" ? (
        loading
      ) : isPdf ? (
        <PdfBrowserPlaceholder path={activePath} projectLocation={projectLocation} />
      ) : fileMediaType(activePath) ? (
        <EditorMediaViews key={modelPath} path={activePath} projectLocation={projectLocation} />
      ) : bufferStatus === "ready" && showPreview && isMarkdown ? (
        isSvgFile(activePath) ? (
          <SvgFileView path={activePath} content={content ?? ""} />
        ) : (
          <MarkdownPreview content={content ?? ""} />
        )
      ) : bufferStatus === "ready" ? (
        <Suspense fallback={loading}>
          <LocalMonacoEditor
            path={modelPath}
            language={getLanguageFromPath(activePath)}
            theme={monacoTheme}
            value={content ?? ""}
            onChange={(value) => {
              if (value !== undefined)
                useFileEditorStore.getState().updateBuffer(activePath, value);
            }}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            keepCurrentModel
            options={EDITOR_OPTIONS}
            loading={loading}
          />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}

function PdfBrowserPlaceholder(props: { path: string; projectLocation: ProjectLocation | null }) {
  const { t } = useLingui();
  const location = props.projectLocation ?? undefined;

  useEffect(() => {
    openPdfPreview(props.path, location);
  }, [props.path, location]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-muted">
      <p>
        <Trans>PDF preview opens in the browser.</Trans>
      </p>
      <button
        type="button"
        className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-foreground transition-colors hover:bg-[var(--row-hover)]"
        onClick={() => openPdfPreview(props.path, location)}
      >
        {t`Open in browser`}
      </button>
    </div>
  );
}
