import { useEffect } from "react";
import type { Monaco } from "@monaco-editor/react";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { lspOrchestrator } from "@/renderer/lsp";
import { createLspFileUri } from "@/shared/lsp";
import { isHomeProjectId } from "@/shared/homeScope";

export function useLspSync(params: {
  monaco: Monaco | null;
  activePath: string | null;
  bufferStatus: string | null;
}) {
  const { monaco, activePath, bufferStatus } = params;
  const lspEnabled = useSharedSettings((s) => s.editorLspEnabled);
  const rootProjectId = useFileEditorStore((state) => state.rootContext?.projectId ?? null);
  const rootProjectLocation = useFileEditorStore(
    (state) => state.rootContext?.projectLocation ?? null,
  );

  // Start the server and sync the active document once Monaco has mounted and
  // the buffer content is ready. Home opens individual files without treating
  // the user's entire home directory as a language-server workspace.
  useEffect(() => {
    if (
      !lspEnabled ||
      !monaco ||
      !rootProjectId ||
      isHomeProjectId(rootProjectId) ||
      !rootProjectLocation ||
      !activePath ||
      bufferStatus !== "ready"
    ) {
      return;
    }

    const currentBuffer = useFileEditorStore.getState().buffers[activePath];
    if (!currentBuffer || currentBuffer.status !== "ready") return;

    const uri = createLspFileUri(rootProjectLocation, activePath);
    let cancelled = false;

    void lspOrchestrator
      .ensureServer(monaco, rootProjectId, rootProjectLocation, activePath)
      .then((session) => {
        if (cancelled || !session) return;
        const latestBuffer = useFileEditorStore.getState().buffers[activePath];
        if (!latestBuffer || latestBuffer.status !== "ready") return;

        session.docSync.didOpen(uri, latestBuffer.content, activePath);

        const model = monaco.editor.getModel(monaco.Uri.parse(uri));
        if (model) session.docSync.watchModel(model);
      })
      .catch((error: unknown) => {
        console.warn("[LSP] Failed to sync document:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [lspEnabled, monaco, rootProjectId, rootProjectLocation, activePath, bufferStatus]);

  // Cleanup when project changes
  useEffect(() => {
    const projectId = rootProjectId;
    return () => {
      if (projectId && !isHomeProjectId(projectId)) void lspOrchestrator.stopProject(projectId);
    };
  }, [rootProjectId]);

  function notifyDidSave(path: string) {
    if (!lspEnabled || !rootProjectId || isHomeProjectId(rootProjectId) || !rootProjectLocation) {
      return;
    }
    const session = lspOrchestrator.getSession(rootProjectId, path);
    const savedBuffer = useFileEditorStore.getState().buffers[path];
    if (session && savedBuffer?.status === "ready") {
      session.docSync.didSave(createLspFileUri(rootProjectLocation, path), savedBuffer.content);
    }
  }

  return { notifyDidSave };
}
