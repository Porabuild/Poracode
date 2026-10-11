import type { Monaco } from "@monaco-editor/react";
import type { ProjectLocation } from "@/shared/contracts";
import { createLspRootUri } from "@/shared/lsp";
import { readBridge } from "../bridge";
import { detectLanguageServerId, getMonacoLanguages } from "./languageSupport";
import { LspIpcTransport } from "./ipcTransport";
import { registerLspProviders } from "./monacoProviders";
import { DocumentSyncManager } from "./documentSync";

type IDisposable = { dispose(): void };

interface LspSession {
  transport: LspIpcTransport;
  docSync: DocumentSyncManager;
  providerDisposables: IDisposable[];
}

interface SessionAttempt {
  sessionId: string;
  projectId: string;
  languageId: string;
  retired: boolean;
  startRequested: boolean;
  transport: LspIpcTransport | null;
  session: LspSession | null;
  ready: Promise<LspSession | null>;
}

interface Retirement {
  projectId: string;
  finished: Promise<void>;
}

/** Owns pending and ready language servers. Project retirement fences both. */
export class LspOrchestrator {
  private attempts = new Map<string, SessionAttempt>();
  private retirements = new Map<string, Retirement>();
  private disposed = false;
  private projectOwners = new Map<string, Set<symbol>>();

  async ensureServer(
    monaco: Monaco,
    projectId: string,
    projectLocation: ProjectLocation,
    filePath: string,
  ): Promise<LspSession | null> {
    // Remote paths belong to the paired host, never a local language server.
    if (this.disposed || projectLocation.remoteServerId) return null;
    const languageId = detectLanguageServerId(filePath);
    if (!languageId) return null;
    const sessionId = `${projectId}:${languageId}`;
    const existing = this.attempts.get(sessionId);
    if (existing) return existing.ready;

    const attempt: SessionAttempt = {
      sessionId,
      projectId,
      languageId,
      retired: false,
      startRequested: false,
      transport: null,
      session: null,
      ready: Promise.resolve(null),
    };
    this.attempts.set(sessionId, attempt);
    attempt.ready = this.startAttempt(attempt, monaco, projectLocation);
    return attempt.ready;
  }

  private current(attempt: SessionAttempt): boolean {
    return !this.disposed && !attempt.retired && this.attempts.get(attempt.sessionId) === attempt;
  }

  private async startAttempt(
    attempt: SessionAttempt,
    monaco: Monaco,
    location: ProjectLocation,
  ): Promise<LspSession | null> {
    try {
      // A previous stop must be acknowledged before reusing its wire session ID.
      await this.retirements.get(attempt.sessionId)?.finished;
      if (!this.current(attempt)) return null;
      const transport = new LspIpcTransport(attempt.sessionId);
      attempt.transport = transport;
      transport.onStatus((status) => {
        if (this.current(attempt) && attempt.session) {
          if (status === "starting") attempt.session.docSync.suspend();
          if (status === "ready") attempt.session.docSync.resume();
        }
        if ((status === "error" || status === "stopped") && this.current(attempt))
          void this.retire(attempt);
      });
      attempt.startRequested = true;
      await readBridge().lspStart({
        sessionId: attempt.sessionId,
        projectLocation: location,
        languageId: attempt.languageId,
      });
      if (!this.current(attempt)) return null;
      const providerDisposables = registerLspProviders(
        monaco,
        transport,
        getMonacoLanguages(attempt.languageId),
        monaco.Uri.parse(createLspRootUri(location)).toString(),
      );
      attempt.session = {
        transport,
        providerDisposables,
        docSync: new DocumentSyncManager(transport),
      };
      if (!this.current(attempt)) {
        this.releaseResources(attempt);
        return null;
      }
      return attempt.session;
    } catch (error) {
      if (this.current(attempt)) {
        console.warn(`[LSP] Failed to start ${attempt.languageId} server:`, error);
        void this.retire(attempt);
      }
      return null;
    }
  }

  getSession(projectId: string, filePath: string): LspSession | null {
    const languageId = detectLanguageServerId(filePath);
    if (!languageId) return null;
    return this.attempts.get(`${projectId}:${languageId}`)?.session ?? null;
  }

  private releaseResources(attempt: SessionAttempt): void {
    if (attempt.session) {
      for (const disposable of attempt.session.providerDisposables) disposable.dispose();
      attempt.session.docSync.dispose();
      attempt.session = null;
    }
    attempt.transport?.dispose();
    attempt.transport = null;
  }

  private retire(attempt: SessionAttempt): Promise<void> {
    if (attempt.retired)
      return this.retirements.get(attempt.sessionId)?.finished ?? Promise.resolve();
    attempt.retired = true;
    if (this.attempts.get(attempt.sessionId) === attempt) this.attempts.delete(attempt.sessionId);
    this.releaseResources(attempt);
    const previous = this.retirements.get(attempt.sessionId)?.finished;
    const retirement: Retirement = {
      projectId: attempt.projectId,
      finished: (async () => {
        await previous;
        if (attempt.startRequested) {
          try {
            await readBridge().lspStop({ sessionId: attempt.sessionId });
          } catch {
            /* Host retirement is best effort. */
          }
        }
      })(),
    };
    this.retirements.set(attempt.sessionId, retirement);
    void retirement.finished.then(() => {
      if (this.retirements.get(attempt.sessionId) === retirement)
        this.retirements.delete(attempt.sessionId);
    });
    return retirement.finished;
  }

  /** Editor surfaces share one project lifetime, including transition overlap. */
  retainProject(projectId: string): IDisposable {
    if (this.disposed) return { dispose: () => {} };
    let owners = this.projectOwners.get(projectId);
    if (!owners) {
      owners = new Set();
      this.projectOwners.set(projectId, owners);
    }
    const token = Symbol();
    const activeOwners = owners;
    activeOwners.add(token);
    return {
      dispose: () => {
        if (!activeOwners.delete(token)) return;
        if (activeOwners.size === 0 && this.projectOwners.get(projectId) === activeOwners) {
          this.projectOwners.delete(projectId);
          void this.stopProject(projectId);
        }
      },
    };
  }

  async stopProject(projectId: string): Promise<void> {
    const finished = [...this.retirements.values()]
      .filter((r) => r.projectId === projectId)
      .map((r) => r.finished);
    // Retire all owners synchronously before awaiting any stop acknowledgement.
    for (const attempt of this.attempts.values()) {
      if (attempt.projectId === projectId) finished.push(this.retire(attempt));
    }
    await Promise.all(finished);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.projectOwners.clear();
    for (const attempt of this.attempts.values()) void this.retire(attempt);
  }
}

export const lspOrchestrator = new LspOrchestrator();
