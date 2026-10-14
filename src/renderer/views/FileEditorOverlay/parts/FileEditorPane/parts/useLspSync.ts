import { useEffect } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { lspOrchestrator } from "@/renderer/lsp";
import { createLspFileUri } from "@/shared/lsp";
import { isHomeProjectId } from "@/shared/homeScope";

export function useLspSync(params: {
  monaco: Monaco | null;
  model: MonacoEditor.ITextModel | null;
  activePath: string | null;
  bufferStatus: string | null;
}) {
  const { monaco, model, activePath, bufferStatus } = params;
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
      !model ||
      model.isDisposed() ||
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

    const uri = monaco.Uri.parse(createLspFileUri(rootProjectLocation, activePath)).toString();
    if (model.uri.toString() !== uri) return;
    let cancelled = false;

    const syncCurrentModel = async () => {
      while (!model.isDisposed()) {
        if (cancelled) return;
        const session = await lspOrchestrator.ensureServer(
          monaco,
          rootProjectId,
          rootProjectLocation,
          activePath,
        );
        if (cancelled || !session || model.isDisposed()) return;
        const latestBuffer = useFileEditorStore.getState().buffers[activePath];
        if (!latestBuffer || latestBuffer.status !== "ready") return;
        // A surface transfer can retire a fulfilled readiness promise before
        // this callback runs. Reacquire without waiting for a model/path change.
        if (lspOrchestrator.getSession(rootProjectId, activePath) !== session) continue;
        session.docSync.bindModel(model, activePath);
        return;
      }
    };
    void syncCurrentModel().catch((error: unknown) => {
      console.warn("[LSP] Failed to sync document:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [lspEnabled, monaco, model, rootProjectId, rootProjectLocation, activePath, bufferStatus]);
}

// Project ownership and save notifications outlive editor tab/model changes.
export function useLspLifecycle(monaco: Monaco | null) {
  const lspEnabled = useSharedSettings((s) => s.editorLspEnabled);
  const rootProjectId = useFileEditorStore((state) => state.rootContext?.projectId ?? null);
  const rootProjectLocation = useFileEditorStore(
    (state) => state.rootContext?.projectLocation ?? null,
  );

  useEffect(() => {
    if (!lspEnabled || !rootProjectId || isHomeProjectId(rootProjectId)) return;
    const owner = lspOrchestrator.retainProject(rootProjectId);
    return () => owner.dispose();
  }, [lspEnabled, rootProjectId]);

  function notifyDidSave(path: string) {
    if (!lspEnabled || !rootProjectId || isHomeProjectId(rootProjectId) || !rootProjectLocation) {
      return;
    }
    const session = lspOrchestrator.getSession(rootProjectId, path);
    const savedBuffer = useFileEditorStore.getState().buffers[path];
    if (session && monaco && savedBuffer?.status === "ready") {
      // Use the model URI spelling, including Monaco's Windows drive normalization.
      const uri = monaco.Uri.parse(createLspFileUri(rootProjectLocation, path)).toString();
      session.docSync.didSave(uri, savedBuffer.content);
    }
  }

  return { notifyDidSave };
}
