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
  factoryRecord,
  factoryString,
  isFactoryTaskTool,
  mapFactoryTranscriptRecord,
} from "./subagentTranscriptMapping";

interface FactoryTaskInvocation {
  parentSessionId: string;
  parentToolUseId: string;
  childSessionId: string;
}

interface TrackedFactoryChild {
  childSessionId: string;
  ownerToolCallId: string;
  rootToolCallId: string;
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
  private readonly rootSessionByToolCallId = new Map<string, string>();
  private readonly knownTaskToolCallIds = new Set<string>();
  private readonly trackedChildren = new Map<string, TrackedFactoryChild>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private stopWatching: (() => void) | undefined;
  private syncPromise: Promise<void> | undefined;
  private syncAgain = false;
  private flushTailRequested = false;
  private readonly finishingRootToolCallIds = new Set<string>();
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
    if (this.disposed) return;
    const update = notification.update as Record<string, unknown>;
    const toolCallId = factoryString(update.toolCallId);
    if (!toolCallId) return;

    if (update.sessionUpdate === "tool_call" && isFactoryTaskTool(update)) {
      this.rootSessionByToolCallId.set(toolCallId, notification.sessionId);
      this.knownTaskToolCallIds.add(toolCallId);
      this.startMonitoring();
      if (this.monitor) queueMicrotask(() => void this.sync());
      return;
    }

    if (
      update.sessionUpdate === "tool_call_update" &&
      isTerminalToolStatus(update.status) &&
      this.rootSessionByToolCallId.has(toolCallId)
    ) {
      if (!this.finishingRootToolCallIds.has(toolCallId)) {
        this.finishingRootToolCallIds.add(toolCallId);
        void this.finishRootTask(toolCallId, notification).catch((error: unknown) => {
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
    if (this.disposed || this.rootSessionByToolCallId.size === 0) return Promise.resolve();
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
        await readSessionFileText(
          this.location,
          factoryRegistryPath(home),
          FACTORY_REGISTRY_MAX_BYTES,
        ),
      );
      for (let pass = 0; pass < 4; pass += 1) {
        const before = this.trackedChildren.size;
        await this.trackRelevantInvocations(invocations, home);
        await this.readTrackedChildren(flushTail);
        if (this.trackedChildren.size === before) break;
      }
    } while (this.syncAgain || this.flushTailRequested);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMonitoring();
    this.rootSessionByToolCallId.clear();
    this.knownTaskToolCallIds.clear();
    this.trackedChildren.clear();
    this.finishingRootToolCallIds.clear();
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
      const rootToolCallId = this.resolveRootToolCallId(invocation);
      if (!rootToolCallId || !this.knownTaskToolCallIds.has(invocation.parentToolUseId)) continue;
      const child: TrackedFactoryChild = {
        childSessionId: invocation.childSessionId,
        ownerToolCallId: invocation.parentToolUseId,
        rootToolCallId,
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

  private resolveRootToolCallId(invocation: FactoryTaskInvocation): string | undefined {
    const rootSessionId = this.rootSessionByToolCallId.get(invocation.parentToolUseId);
    if (rootSessionId === invocation.parentSessionId) return invocation.parentToolUseId;
    const parent = this.trackedChildren.get(invocation.parentSessionId);
    return parent?.rootToolCallId;
  }

  private async readTrackedChildren(flushTail: boolean): Promise<void> {
    for (const child of this.trackedChildren.values()) {
      if (!this.rootSessionByToolCallId.has(child.rootToolCallId)) continue;
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

  private async finishRootTask(
    toolCallId: string,
    notification: SessionNotification,
  ): Promise<void> {
    let syncError: unknown;
    try {
      await this.sync(true);
    } catch (error) {
      syncError = error;
    }
    if (this.disposed) return;
    this.rootSessionByToolCallId.delete(toolCallId);
    this.finishingRootToolCallIds.delete(toolCallId);
    for (const [childSessionId, child] of this.trackedChildren) {
      if (child.rootToolCallId !== toolCallId) continue;
      this.knownTaskToolCallIds.delete(child.ownerToolCallId);
      this.trackedChildren.delete(childSessionId);
    }
    this.knownTaskToolCallIds.delete(toolCallId);
    if (this.rootSessionByToolCallId.size === 0) this.stopMonitoring();
    this.ingest(notification);
    if (syncError !== undefined) {
      throw syncError instanceof Error ? syncError : new Error(String(syncError));
    }
  }

  private ingestChildText(child: TrackedFactoryChild, text: string, flushTail = false): void {
    if (!this.rootSessionByToolCallId.has(child.rootToolCallId)) return;
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
        const update = notification.update as Record<string, unknown>;
        if (update.sessionUpdate === "tool_call" && isFactoryTaskTool(update)) {
          const nestedToolCallId = factoryString(update.toolCallId);
          if (nestedToolCallId) this.knownTaskToolCallIds.add(nestedToolCallId);
        }
        if (!this.rootSessionByToolCallId.has(child.rootToolCallId)) return;
        this.ingest(notification);
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
    if (!parentSessionId || !parentToolUseId || !childSessionId) return [];
    return [
      {
        parentSessionId,
        parentToolUseId,
        childSessionId,
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
