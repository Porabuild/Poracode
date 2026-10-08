import { useEffect, useState } from "react";
import type { Monaco } from "@monaco-editor/react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { macosTrafficLightPadClass } from "@/renderer/components/layout/sidebarChrome";
import {
  useActiveBufferStatus,
  useIsActiveBufferDirty,
  useTabPaths,
} from "@/renderer/state/fileEditorSelectors";
import { isSvgFile } from "@/shared/fileMedia";
import { getBasename, isMarkdownFile } from "@/shared/pathUtils";
import { useResolvedTheme } from "./parts/monacoThemes";
import { SortableTab } from "./parts/SortableTab";
import { EditorToolbar } from "./parts/EditorToolbar";
import { MobileFileEditorActions } from "./parts/MobileFileEditorActions";
import { useLspLifecycle } from "./parts/useLspSync";

import { EditorBody } from "./parts/EditorBody";

export { getLanguageFromPath } from "./parts/langMap";

export function FileEditorPane(props: {
  showTabs: boolean;
  headerNeedsTrafficLightPad?: boolean;
  onOpenFullscreen?: () => void;
  onClose?: () => void;
  mobileControls?: boolean;
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

  const isMarkdown = activePath ? isMarkdownFile(activePath) || isSvgFile(activePath) : false;

  const { notifyDidSave } = useLspLifecycle(monacoInstance);

  // Derived from the store so the eye button, the shortcut, and fresh mounts
  // always agree on the preview state.
  const showPreview = Boolean(activePath && isMarkdown && markdownPreviewPath === activePath);

  async function handleSave(path: string) {
    try {
      await useFileEditorStore.getState().saveFile(path);
      notifyDidSave(path);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : String(error));
    }
  }

  function togglePreview() {
    useFileEditorStore.getState().toggleMarkdownPreview();
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

  const monacoTheme = theme === "dark" ? "poracode-dark" : "poracode-light";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      {props.mobileControls && activePath ? (
        <MobileFileEditorActions
          isDirty={isDirty}
          isMarkdown={isMarkdown}
          showPreview={showPreview}
          onSave={() => void handleSave(activePath)}
          onTogglePreview={togglePreview}
        />
      ) : null}

      {props.showTabs ? (
        <TabStripHeader
          isDirty={isDirty}
          isMarkdown={isMarkdown}
          showPreview={showPreview}
          onTogglePreview={togglePreview}
          activePath={activePath}
          headerNeedsTrafficLightPad={props.headerNeedsTrafficLightPad ?? false}
          onSave={(path) => void handleSave(path)}
          handleCloseTab={handleCloseTab}
          {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
          {...(props.onClose ? { onClose: props.onClose } : {})}
        />
      ) : null}

      {activePath && bufferStatus ? (
        <>
          {!props.showTabs && !props.mobileControls ? (
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
                onTogglePreview={togglePreview}
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
            onSave={(path) => void handleSave(path)}
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
  onTogglePreview: () => void;
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
        onWheel={(event) => {
          // Map vertical wheel to horizontal scrolling so overflowed tabs are reachable.
          if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
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

      <div className="poracode-content-over-drag-region flex items-center gap-1.5">
        <EditorToolbar
          isMarkdown={props.isMarkdown}
          showPreview={props.showPreview}
          onTogglePreview={props.onTogglePreview}
          isDirty={props.isDirty}
          activePath={props.activePath}
          onSave={() => props.activePath && props.onSave(props.activePath)}
          {...(props.onOpenFullscreen ? { onOpenFullscreen: props.onOpenFullscreen } : {})}
          {...(props.onClose ? { onClose: props.onClose } : {})}
        />
      </div>
    </div>
  );
}
