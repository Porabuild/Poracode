import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import {
  findSessionFiles,
  readSessionFileText,
  resolveWslHomeDirectoryAsync,
  watchSessionPaths,
} from "../base";
import type { AcpExternalSessionUpdateSource, AcpStructuredSession } from "../acp/session";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_SUBAGENT_STATUS_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping/subagents";
import {
  factoryBackgroundTaskSessionId,
  factoryRecord,
  factoryString,
  isFactoryTaskTool,
  mapFactoryTranscriptRecord,
} from "./subagentTranscriptMapping";

interface FactoryTaskInvocation {
  parentSessionId: string;
  parentToolUseId: string;
  childSessionId: string;
  status?: string;
}

interface TrackedFactoryChild {
  childSessionId: string;
  ownerToolCallId: string;
  filePath: string | undefined;
  processedLength: number;
}

interface FactoryTranscriptBridgeOptions {
  factoryHome?: string;
  monitor?: boolean;
}

const FACTORY_TRANSCRIPT_POLL_MS = 250;
const FACTORY_REGISTRY_MAX_BYTES = 2 * 1024 * 1024;

export class FactorySubagentTranscriptBridge implements AcpExternalSessionUpdateSource {
  private factoryHome: string | undefined;
  private readonly monitor: boolean;
  private readonly sessionByTaskToolCallId = new Map<string, string>();
  private readonly trackedChildren = new Map<string, TrackedFactoryChild>();
  private readonly backgroundTaskSessionIds = new Map<string, string>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private stopWatching: (() => void) | undefined;
  private syncPromise: Promise<void> | undefined;
  private syncAgain = false;
  private flushTailRequested = false;
  private readonly finishingToolCallIds = new Set<string>();
  private disposed = false;

  constructor(
    private readonly location: ProjectLocation,
    private readonly ingest: (notification: SessionNotification) => void,
    options: FactoryTranscriptBridgeOptions = {},
  ) {
    this.factoryHome = options.factoryHome ?? nativeFactoryHome(location);
    this.monitor = options.monitor !== false;
  }

  onSessionUpdate(notification: SessionNotification): boolean | void {
    return this.handleTaskUpdate(notification, true);
  }

  private handleTaskUpdate(notification: SessionNotification, topLevel: boolean): boolean | void {
    if (this.disposed) return;
    const update = notification.update as Record<string, unknown>;
    const toolCallId = factoryString(update.toolCallId);
    if (!toolCallId) return;

    if (update.sessionUpdate === "tool_call" && isFactoryTaskTool(update)) {
      this.sessionByTaskToolCallId.set(toolCallId, notification.sessionId);
      this.ingest({
        ...notification,
        update: {
          ...notification.update,
          _meta: {
            ...factoryRecord(update._meta),
            ...(topLevel ? { [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true } : {}),
          },
        },
      });
      this.startMonitoring();
      if (this.monitor) queueMicrotask(() => void this.sync());
      return true;
    }

    if (
      update.sessionUpdate === "tool_call_update" &&
      isTerminalToolStatus(update.status) &&
      this.sessionByTaskToolCallId.get(toolCallId) === notification.sessionId
    ) {
      const childSessionId = factoryBackgroundTaskSessionId(update);
      if (update.status === "completed" && childSessionId) {
        this.backgroundTaskSessionIds.set(toolCallId, childSessionId);
        // The launch receipt completes the tool invocation, not the child.
        // Promote it before the foreground prompt can close its turn.
        this.ingest({
          sessionId: notification.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: "in_progress",
            _meta: {
              ...factoryRecord(update._meta),
              [PORACODE_ACP_DETACHED_SUBAGENT_META_KEY]: true,
            },
          },
        });
        if (this.monitor) queueMicrotask(() => void this.sync());
        return true;
      }
      if (!this.finishingToolCallIds.has(toolCallId)) {
        this.finishingToolCallIds.add(toolCallId);
        void this.finishTask(toolCallId, notification).catch((error: unknown) => {
          console.warn(
            "[factory-subagents] final transcript sync failed:",
            error instanceof Error ? error.message : String(error),
          );
        });
      }
      return true;
    }
  }

  sync(flushTail = false): Promise<void> {
    if (this.disposed || this.sessionByTaskToolCallId.size === 0) return Promise.resolve();
    if (flushTail) this.flushTailRequested = true;
    if (this.syncPromise) {
      this.syncAgain = true;
      return this.syncPromise;
    }
    this.syncPromise = this.runSyncLoop().finally(() => {
      this.syncPromise = undefined;
    });
    return this.syncPromise;
  }

  private async runSyncLoop(): Promise<void> {
    do {
      this.syncAgain = false;
      const flushTail = this.flushTailRequested;
      this.flushTailRequested = false;
      const home = await this.resolveFactoryHome();
      if (!home) return;
      const invocations = parseTaskInvocations(
        (await readSessionFileText(
          this.location,
          appendFactoryPath(appendFactoryPath(home, "state"), "task-invocations.json"),
          FACTORY_REGISTRY_MAX_BYTES,
        )) ??
          (await readSessionFileText(
            this.location,
            factoryRegistryPath(home),
            FACTORY_REGISTRY_MAX_BYTES,
          )),
      );
      for (let pass = 0; pass < 4; pass += 1) {
        const before = this.trackedChildren.size;
        const taskCount = this.sessionByTaskToolCallId.size;
        await this.trackRelevantInvocations(invocations, home);
        await this.readTrackedChildren(flushTail);
        if (this.trackedChildren.size === before && this.sessionByTaskToolCallId.size === taskCount)
          break;
      }
      for (const [toolCallId, childSessionId] of [...this.backgroundTaskSessionIds]) {
        const invocation = invocations.find(
          (entry) =>
            entry.parentSessionId === this.sessionByTaskToolCallId.get(toolCallId) &&
            entry.parentToolUseId === toolCallId &&
            entry.childSessionId === childSessionId,
        );
        if (
          !invocation ||
          (invocation.status !== "completed" &&
            invocation.status !== "failed" &&
            invocation.status !== "cancelled")
        ) {
          continue;
        }
        await this.readTrackedChildren(true);
        if (this.disposed) return;
        this.releaseTask(toolCallId);
        this.ingest({
          sessionId: invocation.parentSessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: invocation.status === "completed" ? "completed" : "failed",
            _meta: { [PORACODE_ACP_SUBAGENT_STATUS_META_KEY]: invocation.status },
          },
        });
      }
    } while (this.syncAgain || this.flushTailRequested);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMonitoring();
    this.sessionByTaskToolCallId.clear();
    this.trackedChildren.clear();
    this.backgroundTaskSessionIds.clear();
    this.finishingToolCallIds.clear();
  }

  private startMonitoring(): void {
    if (!this.monitor || this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.sync(), FACTORY_TRANSCRIPT_POLL_MS);
    void this.ensureWatcher();
  }

  private stopMonitoring(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.stopWatching?.();
    this.stopWatching = undefined;
  }

  private async ensureWatcher(): Promise<void> {
    if (this.stopWatching || this.disposed) return;
    const home = await this.resolveFactoryHome();
    if (!home || this.disposed) return;
    this.stopWatching = watchSessionPaths(
      this.location,
      [home],
      () => void this.sync(),
      "factory-subagents",
    );
  }

  private async resolveFactoryHome(): Promise<string | undefined> {
    if (this.factoryHome) return this.factoryHome;
    if (this.location.kind !== "wsl") return undefined;
    const home = await resolveWslHomeDirectoryAsync(this.location.distro);
    this.factoryHome = home ? `${home}/.factory` : undefined;
    return this.factoryHome;
  }

  private async trackRelevantInvocations(
    invocations: FactoryTaskInvocation[],
    home: string,
  ): Promise<void> {
    for (const invocation of invocations) {
      if (this.trackedChildren.has(invocation.childSessionId)) continue;
      if (
        this.sessionByTaskToolCallId.get(invocation.parentToolUseId) !== invocation.parentSessionId
      ) {
        continue;
      }
      const child: TrackedFactoryChild = {
        childSessionId: invocation.childSessionId,
        ownerToolCallId: invocation.parentToolUseId,
        filePath: undefined,
        processedLength: 0,
      };
      child.filePath = await findFactorySessionFile(
        this.location,
        factorySessionsPath(home),
        invocation.childSessionId,
      );
      this.trackedChildren.set(invocation.childSessionId, child);
    }
  }

  private async readTrackedChildren(flushTail: boolean): Promise<void> {
    for (const child of this.trackedChildren.values()) {
      if (!this.sessionByTaskToolCallId.has(child.ownerToolCallId)) continue;
      if (!child.filePath && this.factoryHome) {
        child.filePath = await findFactorySessionFile(
          this.location,
          factorySessionsPath(this.factoryHome),
          child.childSessionId,
        );
      }
      if (!child.filePath) continue;
      const text = await readSessionFileText(this.location, child.filePath);
      if (text !== undefined) this.ingestChildText(child, text, flushTail);
    }
  }

  private async finishTask(toolCallId: string, notification: SessionNotification): Promise<void> {
    let syncError: unknown;
    try {
      await this.sync(true);
    } catch (error) {
      syncError = error;
    }
    if (this.disposed) return;
    this.releaseTask(toolCallId);
    this.ingest(notification);
    if (syncError !== undefined) {
      throw syncError instanceof Error ? syncError : new Error(String(syncError));
    }
  }

  private releaseTask(toolCallId: string): void {
    this.sessionByTaskToolCallId.delete(toolCallId);
    this.backgroundTaskSessionIds.delete(toolCallId);
    this.finishingToolCallIds.delete(toolCallId);
    for (const [childSessionId, child] of this.trackedChildren) {
      if (child.ownerToolCallId !== toolCallId) continue;
      for (const [nestedToolCallId, sessionId] of this.sessionByTaskToolCallId) {
        if (sessionId === childSessionId && !this.backgroundTaskSessionIds.has(nestedToolCallId)) {
          this.releaseTask(nestedToolCallId);
        }
      }
      this.trackedChildren.delete(childSessionId);
    }
    if (this.sessionByTaskToolCallId.size === 0) this.stopMonitoring();
  }

  private ingestChildText(child: TrackedFactoryChild, text: string, flushTail = false): void {
    if (!this.sessionByTaskToolCallId.has(child.ownerToolCallId)) return;
    if (text.length < child.processedLength) child.processedLength = 0;
    const unread = text.slice(child.processedLength);
    const lastNewline = unread.lastIndexOf("\n");
    let consumedLength = lastNewline + 1;
    if (flushTail && consumedLength < unread.length) {
      try {
        JSON.parse(unread.slice(consumedLength));
        consumedLength = unread.length;
      } catch {
        // Keep a partially written final record for the next filesystem update.
      }
    }
    if (consumedLength <= 0) return;
    const recordsText = unread.slice(0, consumedLength);
    child.processedLength += consumedLength;
    for (const line of recordsText.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      for (const notification of mapFactoryTranscriptRecord(
        child.childSessionId,
        child.ownerToolCallId,
        record,
      )) {
        if (!this.sessionByTaskToolCallId.has(child.ownerToolCallId)) return;
        if (this.handleTaskUpdate(notification, false) !== true) this.ingest(notification);
      }
    }
  }
}

export function attachFactorySubagentTranscripts(
  session: AcpStructuredSession,
  location: ProjectLocation,
): void {
  session.attachExternalSessionUpdateSource(
    new FactorySubagentTranscriptBridge(location, (notification) => {
      session.ingestExternalSessionUpdate(notification);
    }),
  );
}

function parseTaskInvocations(text: string | undefined): FactoryTaskInvocation[] {
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const values = factoryRecord(parsed).invocations;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const invocation = factoryRecord(value);
    const parentSessionId = factoryString(invocation.parentSessionId);
    const parentToolUseId = factoryString(invocation.parentToolUseId);
    const childSessionId = factoryString(invocation.childSessionId);
    const status = factoryString(invocation.status);
    if (!parentSessionId || !parentToolUseId || !childSessionId) return [];
    return [
      {
        parentSessionId,
        parentToolUseId,
        childSessionId,
        ...(status ? { status } : {}),
      },
    ];
  });
}

async function findFactorySessionFile(
  location: ProjectLocation,
  sessionsRoot: string,
  sessionId: string,
): Promise<string | undefined> {
  if (location.kind !== "wsl") return findNativeFactorySessionFile(sessionsRoot, sessionId);
  const fileName = `${sessionId}.jsonl`;
  const [match] = await findSessionFiles(location, {
    root: sessionsRoot,
    acceptFile: (name) => name === fileName,
  });
  return match?.path;
}

function findNativeFactorySessionFile(sessionsRoot: string, sessionId: string): string | undefined {
  const fileName = `${sessionId}.jsonl`;
  if (!existsSync(sessionsRoot)) return undefined;
  try {
    for (const group of readdirSync(sessionsRoot, { withFileTypes: true })) {
      if (!group.isDirectory()) continue;
      const candidate = join(sessionsRoot, group.name, fileName);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function nativeFactoryHome(location: ProjectLocation): string | undefined {
  return location.kind === "wsl" ? undefined : join(homedir(), ".factory");
}

function factoryRegistryPath(factoryHome: string): string {
  return appendFactoryPath(factoryHome, "task-invocations.json");
}

function factorySessionsPath(factoryHome: string): string {
  return appendFactoryPath(factoryHome, "sessions");
}

function appendFactoryPath(root: string, child: string): string {
  return root.startsWith("/") ? `${root.replace(/\/+$/u, "")}/${child}` : join(root, child);
}

function isTerminalToolStatus(value: unknown): boolean {
  return value === "completed" || value === "failed";
}
