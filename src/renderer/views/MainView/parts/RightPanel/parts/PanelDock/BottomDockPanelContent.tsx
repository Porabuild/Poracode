import { useAppStore } from "@/renderer/state/appStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore, type RightPanelTab } from "@/renderer/state/panelStore";
import { getCurrentProjectId } from "@/renderer/actions/currentProject";
import { ProjectFilesPanel } from "@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel";
import { BrowserDockSlot } from "../BrowserPanel/BrowserDockSlot";
import { extractBrowserToWindow, injectBrowserToMain } from "../BrowserPanel/browserWindowActions";
import { NotesPanel } from "../NotesPanel/NotesPanel";
import { UsagePanel } from "../UsagePanel/UsagePanel";
import { GitReviewPanelContent } from "../GitReviewPanelContent";
import { resolveFilesRootContext } from "../resolveFilesRootContext";

/**
 * Body of a panel docked beside the bottom terminal. Reuses the same content
 * components the right panel mounts for each tab; `ProjectAuxiliaryPanel`
 * skips a bottom-docked tab so singleton surfaces (the browser webview) are
 * only ever mounted once.
 */
export function BottomDockPanelContent(props: { tab: RightPanelTab }) {
  const projects = useAppStore((s) => s.projects);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);
  const setGitReviewContext = usePanelStore((s) => s.setGitReviewContext);
  const setGitOverlayOpen = usePanelStore((s) => s.setGitOverlayOpen);
  const browserExtracted = useBrowserPanelStore((s) => s.extracted);
  // Reactive id of the project the notes panel should show — recomputed as the
  // user navigates between threads/drafts/projects.
  const currentProjectId = useAppStore(() => getCurrentProjectId());

  switch (props.tab) {
    case "usage":
      return <UsagePanel />;
    case "notes": {
      const notesProjectId = currentProjectId ?? projects[0]?.id;
      return notesProjectId ? <NotesPanel key={notesProjectId} projectId={notesProjectId} /> : null;
    }
    case "browser":
      return (
        <BrowserDockSlot
          extracted={browserExtracted}
          onBringBack={injectBrowserToMain}
          onFocusWindow={extractBrowserToWindow}
        />
      );
    case "git":
      return gitReviewContext ? (
        <GitReviewPanelContent
          gitPanelContext={gitReviewContext}
          onClose={() => setGitReviewContext(null)}
          onExpandToOverlay={() => setGitOverlayOpen(true)}
        />
      ) : null;
    case "files": {
      const rootContext = resolveFilesRootContext(filesPanelContext, projects);
      return rootContext ? <ProjectFilesPanel rootContext={rootContext} /> : null;
    }
    default:
      return null;
  }
}
