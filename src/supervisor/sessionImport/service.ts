import { randomUUID } from "node:crypto";
import { basename, relative, resolve, isAbsolute } from "node:path";
import type {
  ImportSessionTranscriptPayload,
  ImportSessionTranscriptResult,
  ListImportableSessionsPayload,
  ListImportableSessionsResult,
  RuntimeEvent,
} from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { msg } from "@/shared/messages";
import type { AgentAdapter } from "../agents/base";
import type { ImportedTranscript } from "../agents/base/sessionImport";
import {
  DEFAULT_SCAN_LIMITS,
  SessionImportScanner,
  type SessionImportScanLimits,
  type SessionImportStore,
} from "./scanner";

/** One pasted file should not put megabytes into a single chat row. */
const MAX_MESSAGE_CHARS = 100_000;
const REPLAY_BATCH_SIZE = 200;

function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Replays a transcript as the canonical events a live session emits. */
export function buildReplayEvents(
  threadId: string,
  transcript: ImportedTranscript,
): RuntimeEvent[] {
  return transcript.messages.flatMap(({ role, text }): RuntimeEvent[] => {
    const itemId = `import-${randomUUID()}`;
    const capped =
      text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}\n\n[…]` : text;
    const started: RuntimeEvent[] =
      role === "user"
        ? [
            {
              type: "item.started",
              threadId,
              itemId,
              itemType: "user_message",
              payload: { content: [{ kind: "text", text: capped }] },
            },
          ]
        : [
            { type: "item.started", threadId, itemId, itemType: "assistant_message" },
            { type: "content.delta", threadId, itemId, stream: "assistant_text", delta: capped },
          ];
    return [...started, { type: "item.completed", threadId, itemId }];
  });
}

/**
 * Lists and imports transcripts from every adapter that declares
 * `sessionImport`. Replay rides the regular `thread-runtime-events` path, so
 * main persists it and the renderer renders it like live output.
 */
export class SessionImportService {
  private readonly scanner: SessionImportScanner;
  private readonly importing = new Set<string>();

  constructor(
    private readonly adapters: ReadonlyMap<string, AgentAdapter>,
    private readonly emit: (event: SupervisorEvent) => void,
    limits: SessionImportScanLimits = DEFAULT_SCAN_LIMITS,
  ) {
    this.scanner = new SessionImportScanner(() => this.stores(), limits);
  }

  list(payload: ListImportableSessionsPayload): Promise<ListImportableSessionsResult> {
    return this.scanner.list(payload);
  }

  async importTranscript(
    payload: ImportSessionTranscriptPayload,
  ): Promise<ImportSessionTranscriptResult> {
    const source = this.adapters.get(payload.agentKind)?.sessionImport;
    if (!source) throw new Error(msg("sessionImport.unsupported"));
    // The path comes from the renderer: only read files inside the agent's own store.
    const known =
      source.acceptFile(basename(payload.path)) &&
      source.roots.some((root) => isInside(root, payload.path));
    if (!known) throw new Error(msg("sessionImport.unknownTranscript"));
    const key = `${payload.agentKind}:${payload.providerSessionId}`;
    if (this.importing.has(key)) throw new Error(msg("sessionImport.inProgress"));
    this.importing.add(key);
    try {
      const transcript = await source.readTranscript(payload.path);
      if (transcript.providerSessionId !== payload.providerSessionId) {
        throw new Error(msg("sessionImport.changedOnDisk"));
      }
      const events = buildReplayEvents(payload.threadId, transcript);
      for (let index = 0; index < events.length; index += REPLAY_BATCH_SIZE) {
        this.emit({
          type: "thread-runtime-events",
          threadId: payload.threadId,
          events: events.slice(index, index + REPLAY_BATCH_SIZE),
        });
      }
      return { messageCount: transcript.messages.length };
    } finally {
      this.importing.delete(key);
    }
  }

  private stores(): SessionImportStore[] {
    return [...this.adapters.values()].flatMap((adapter) =>
      adapter.sessionImport ? [{ agentKind: adapter.kind, source: adapter.sessionImport }] : [],
    );
  }
}
