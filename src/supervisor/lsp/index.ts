import type { SupervisorEvent } from "@/shared/ipc";
import type { LspStartPayload, LspStopPayload, LspMessagePayload } from "@/shared/lsp";
import { getConfigForLanguage } from "./serverRegistry";
import { ServerInstance } from "./serverInstance";

interface RestartReadiness {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function restartReadiness(): RestartReadiness {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // A restart can end before any caller awaits it.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

interface ServerOwner {
  sessionId: string;
  languageId: string;
  instance: ServerInstance;
  retired: boolean;
  everReady: boolean;
  restarting: RestartReadiness | null;
  ready: Promise<void>;
}

export class LanguageServerManager {
  private sessions = new Map<string, ServerOwner>();
  private disposed = false;

  constructor(private readonly emit: (event: SupervisorEvent) => void) {}

  async start(payload: LspStartPayload): Promise<void> {
    if (this.disposed) throw new Error("Language server manager is disposed.");
    const { sessionId, projectLocation, languageId } = payload;
    const existing = this.sessions.get(sessionId);
    if (existing) {
      await existing.ready;
      if (existing.restarting) await existing.restarting.promise;
      if (!this.current(existing)) throw new Error("Language server is unavailable.");
      return;
    }
    const config = getConfigForLanguage(languageId);
    if (!config) {
      this.emit({
        type: "lsp-status",
        sessionId,
        status: "error",
        languageId,
        error: `No language server configured for "${languageId}"`,
      });
      throw new Error("Language server is unavailable.");
    }

    const instance = new ServerInstance(
      sessionId,
      config,
      projectLocation,
      (message) => {
        if (this.current(owner)) this.emit({ type: "lsp-message", sessionId, message });
      },
      (status, error) => {
        if (!this.current(owner)) return;
        if (status === "starting" && owner.everReady && !owner.restarting)
          owner.restarting = restartReadiness();
        if (status === "ready") {
          owner.everReady = true;
          owner.restarting?.resolve();
          owner.restarting = null;
        }
        if (status === "stopped" || status === "error") this.retire(owner, false);
        this.emit({
          type: "lsp-status",
          sessionId,
          status,
          languageId,
          ...(error !== undefined ? { error } : {}),
        });
      },
    );
    const owner: ServerOwner = {
      sessionId,
      languageId,
      instance,
      retired: false,
      everReady: false,
      restarting: null,
      ready: Promise.resolve(),
    };
    this.sessions.set(sessionId, owner);
    owner.ready = this.initialize(owner);
    return owner.ready;
  }

  private current(owner: ServerOwner): boolean {
    return !this.disposed && !owner.retired && this.sessions.get(owner.sessionId) === owner;
  }

  private async initialize(owner: ServerOwner): Promise<void> {
    // Install the shared promise before callbacks can reenter start/sendMessage.
    await Promise.resolve();
    if (!this.current(owner)) return;
    try {
      await owner.instance.start();
    } catch (error) {
      this.retire(owner, false);
      throw error;
    }
  }

  private retire(owner: ServerOwner, emitStopped: boolean): void {
    if (owner.retired) return;
    owner.retired = true;
    owner.restarting?.reject(new Error("Language server is unavailable."));
    owner.restarting = null;
    if (this.sessions.get(owner.sessionId) === owner) this.sessions.delete(owner.sessionId);
    if (emitStopped)
      this.emit({
        type: "lsp-status",
        sessionId: owner.sessionId,
        languageId: owner.languageId,
        status: "stopped",
      });
    owner.instance.dispose(false);
  }

  async stop(payload: LspStopPayload): Promise<void> {
    const owner = this.sessions.get(payload.sessionId);
    if (owner) this.retire(owner, true);
  }

  async sendMessage(payload: LspMessagePayload): Promise<unknown> {
    const owner = this.sessions.get(payload.sessionId);
    if (!owner) return undefined;
    await owner.ready;
    if (!this.current(owner) || owner.restarting) return undefined;
    // Restarted document state is rebuilt from the renderer's live models.
    // Old versions/requests must not be delivered into the fresh connection.
    return owner.instance.sendMessage(payload.message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const owner of this.sessions.values()) this.retire(owner, true);
  }
}
