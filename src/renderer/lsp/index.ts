import type { Monaco } from "@monaco-editor/react";
import type { ProjectLocation } from "@/shared/contracts";
import { createLspRootUri } from "@/shared/lsp";
import { readBridge } from "../bridge";
import { getLanguageFromPath } from "../views/FileEditorOverlay/parts/FileEditorPane/FileEditorPane";
import { LspIpcTransport } from "./ipcTransport";
import { registerLspProviders } from "./monacoProviders";
import { DocumentSyncManager } from "./documentSync";

type IDisposable = { dispose(): void };

/** Map file extension to the language server's languageId. */
function detectLanguageServerId(filePath: string): string | null {
  const lang = getLanguageFromPath(filePath);
  // Map Monaco language IDs to language server IDs
  switch (lang) {
    case "typescript":
    case "javascript":
      return "typescript";
    case "python":
      return "python";
    case "go":
      return "go";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "rust":
      return "rust";
    default:
      return null;
  }
}

/** Monaco language IDs served by a given server language ID. */
function getMonacoLanguages(serverLanguageId: string): string[] {
  switch (serverLanguageId) {
    case "typescript":
      return ["typescript", "javascript"];
    case "css":
      return ["css", "scss", "less"];
    default:
      return [serverLanguageId];
  }
}

interface LspSession {
  transport: LspIpcTransport;
  docSync: DocumentSyncManager;
  providerDisposables: IDisposable[];
}

/**
 * Manages LSP sessions per project+language.
 * Call `ensureServer()` when a file opens, `stopProject()` when editor closes.
 */
export class LspOrchestrator {
  private sessions = new Map<string, LspSession>();

  async ensureServer(
    monaco: Monaco,
    projectId: string,
    projectLocation: ProjectLocation,
    filePath: string,
  ): Promise<LspSession | null> {
    // LSP sessions and their message stream are owned by the local supervisor.
    // Remote file editing remains available, but must never start a local
    // language server against a path that exists only on the paired host.
    if (projectLocation.remoteServerId) return null;
    const languageId = detectLanguageServerId(filePath);
    if (!languageId) return null;

    const sessionId = `${projectId}:${languageId}`;
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    // Start the language server via IPC
    const transport = new LspIpcTransport(sessionId);

    try {
      await readBridge().lspStart({ sessionId, projectLocation, languageId });
    } catch (error) {
      transport.dispose();
      console.warn(`[LSP] Failed to start ${languageId} server:`, error);
      return null;
    }

    const monacoLanguages = getMonacoLanguages(languageId);
    const providerDisposables = registerLspProviders(
      monaco,
      transport,
      monacoLanguages,
      createLspRootUri(projectLocation),
    );
    const docSync = new DocumentSyncManager(transport);

    const session: LspSession = { transport, docSync, providerDisposables };
    this.sessions.set(sessionId, session);
    return session;
  }

  /** Get the active session for a file (if any). */
  getSession(projectId: string, filePath: string): LspSession | null {
    const languageId = detectLanguageServerId(filePath);
    if (!languageId) return null;
    return this.sessions.get(`${projectId}:${languageId}`) ?? null;
  }

  async stopProject(projectId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (sessionId.startsWith(`${projectId}:`)) {
        for (const d of session.providerDisposables) d.dispose();
        session.docSync.dispose();
        session.transport.dispose();
        this.sessions.delete(sessionId);
        try {
          await readBridge().lspStop({ sessionId });
        } catch {
          /* ignore */
        }
      }
    }
  }

  dispose(): void {
    for (const [sessionId, session] of this.sessions) {
      for (const d of session.providerDisposables) d.dispose();
      session.docSync.dispose();
      session.transport.dispose();
      readBridge()
        .lspStop({ sessionId })
        .catch(() => {});
    }
    this.sessions.clear();
  }
}

/** Singleton orchestrator — shared across all editor instances. */
export const lspOrchestrator = new LspOrchestrator();
