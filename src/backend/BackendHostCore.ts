import { closeDatabase, dbMarkLiveThreadsInactive, initDatabase } from "@/main/db";
import { SupervisorClient, type SupervisorClientOptions } from "@/main/supervisor/SupervisorClient";
import { persistSupervisorEvent } from "@/main/remote/server/runtimePersistence";
import { TerminalScrollbackPersistence } from "@/main/remote/server/terminalScrollbackPersistence";
import type { SupervisorEvent } from "@/shared/ipc";
import type { BackendEventInterests } from "@/shared/backendHostProtocol";
import {
  filterRuntimeEventsForLiveInterest,
  isBulkRuntimeContentEvent,
} from "@/shared/liveEventInterests";

export interface BackendHostCoreOptions {
  baseDir: string;
  dbPath: string;
  databaseSchemaMode?: "migrate" | "validate";
  markLiveThreadsInactiveOnOpen?: boolean;
  supervisor: Omit<SupervisorClientOptions, "baseDir" | "onEvent" | "onReset">;
  onEvent(event: SupervisorEvent): void;
  onReset(): void;
}

/**
 * Keeps high-volume live payloads behind explicit client interest while the
 * backend still persists every event before this projection is evaluated.
 */
export function filterSupervisorEventForInterests(
  event: SupervisorEvent,
  interests: BackendEventInterests,
  hiddenShellActivityAt?: Map<string, number>,
  now = Date.now(),
): SupervisorEvent | null {
  if (event.type === "thread-output") {
    if (interests.terminalThreadIds.includes(event.threadId)) return event;
    if (!event.threadId.startsWith("shell:") || !hiddenShellActivityAt) return null;
    const lastActivityAt = hiddenShellActivityAt.get(event.threadId) ?? -Infinity;
    if (now - lastActivityAt < 500) return null;
    hiddenShellActivityAt.set(event.threadId, now);
    return { ...event, data: "" };
  }
  if (event.type === "thread-reset" || event.type === "thread-exited") {
    hiddenShellActivityAt?.delete(event.threadId);
  }
  if (interests.allRuntimeEvents) return event;
  if (event.type === "thread-runtime-event") {
    return interests.runtimeThreadIds.includes(event.threadId) ||
      !isBulkRuntimeContentEvent(event.event)
      ? event
      : null;
  }
  if (event.type === "thread-runtime-events") {
    const events = filterRuntimeEventsForLiveInterest(
      event.events,
      interests.runtimeThreadIds.includes(event.threadId),
    );
    return events.length === 0
      ? null
      : events === event.events
        ? event
        : { ...event, events: [...events] };
  }
  if (event.type === "thread-runtime-events-multi") {
    const wanted = new Set(interests.runtimeThreadIds);
    let changed = false;
    const batches = event.batches.flatMap((batch) => {
      const events = filterRuntimeEventsForLiveInterest(batch.events, wanted.has(batch.threadId));
      if (events.length === 0) {
        changed = true;
        return [];
      }
      if (events === batch.events) return [batch];
      changed = true;
      return [{ ...batch, events: [...events] }];
    });
    return batches.length === 0 ? null : changed ? { ...event, batches } : event;
  }
  return event;
}

/**
 * Owns the backend's live projection state, including the short bootstrap
 * window that prevents initial PTY output from racing the renderer's first
 * interest acknowledgement.
 */
export class BackendEventRouter {
  private interests: BackendEventInterests = {
    terminalThreadIds: [],
    runtimeThreadIds: [],
    allRuntimeEvents: false,
  };
  private readonly terminalBootstrapInterests = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly hiddenShellActivityAt = new Map<string, number>();

  retainTerminalBootstrap(threadId: string): void {
    this.clearTerminalBootstrap(threadId);
    const timer = setTimeout(() => this.terminalBootstrapInterests.delete(threadId), 10_000);
    timer.unref?.();
    this.terminalBootstrapInterests.set(threadId, timer);
  }

  clearTerminalBootstrap(threadId: string): void {
    const timer = this.terminalBootstrapInterests.get(threadId);
    if (timer) clearTimeout(timer);
    this.terminalBootstrapInterests.delete(threadId);
  }

  setInterests(interests: BackendEventInterests): void {
    this.interests = interests;
    for (const threadId of interests.terminalThreadIds) {
      this.clearTerminalBootstrap(threadId);
    }
  }

  filter(event: SupervisorEvent): SupervisorEvent | null {
    if (event.type === "thread-output" && this.terminalBootstrapInterests.has(event.threadId)) {
      return event;
    }
    return filterSupervisorEventForInterests(event, this.interests, this.hiddenShellActivityAt);
  }

  dispose(): void {
    for (const timer of this.terminalBootstrapInterests.values()) clearTimeout(timer);
    this.terminalBootstrapInterests.clear();
    this.hiddenShellActivityAt.clear();
  }
}

/**
 * Process-agnostic owner for Poracode's durable state and agent runtime.
 * Desktop and headless composition roots add their own UI/network adapters,
 * while this core keeps database lifecycle and supervisor-event durability in
 * one place so it can move behind a transport without changing those services.
 */
export class BackendHostCore {
  readonly supervisorClient: SupervisorClient;
  private readonly terminalScrollbackPersistence = new TerminalScrollbackPersistence();
  private databaseOpen = false;

  constructor(private readonly options: BackendHostCoreOptions) {
    this.databaseOpen = true;
    try {
      if (options.databaseSchemaMode) {
        initDatabase(options.dbPath, { schemaMode: options.databaseSchemaMode });
      } else {
        initDatabase(options.dbPath);
      }
      if (options.markLiveThreadsInactiveOnOpen) dbMarkLiveThreadsInactive();

      this.supervisorClient = new SupervisorClient({
        ...options.supervisor,
        baseDir: options.baseDir,
        onEvent: (event) => {
          this.terminalScrollbackPersistence.handle(event);
          persistSupervisorEvent(event);
          options.onEvent(event);
        },
        onReset: options.onReset,
      });
    } catch (error) {
      closeDatabase();
      this.databaseOpen = false;
      throw error;
    }
  }

  startSupervisor(): void {
    this.supervisorClient.start();
  }

  restartSupervisor(): void {
    this.supervisorClient.start();
  }

  disposeSupervisor(): void {
    this.supervisorClient.dispose();
  }

  closeDatabase(): void {
    if (!this.databaseOpen) return;
    this.terminalScrollbackPersistence.flush();
    this.databaseOpen = false;
    closeDatabase();
  }

  dispose(): void {
    this.disposeSupervisor();
    this.closeDatabase();
  }
}
