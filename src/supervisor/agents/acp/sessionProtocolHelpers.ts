import {
  PROTOCOL_VERSION,
  RequestError,
  type ContentBlock,
  type InitializeRequest,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { toErrorMessage } from "@/shared/errorMessage";

/**
 * Old Droid builds reject `session/new` with JSON-RPC invalid-params or
 * internal-error when handed an HTTP MCP server. Retry only those protocol
 * compatibility failures; transport, auth, and other session-open failures
 * must remain visible instead of silently launching without requested MCPs.
 */
export function isAssumedMcpCompatibilityError(error: unknown): error is RequestError {
  if (!(error instanceof RequestError) || (error.code !== -32602 && error.code !== -32603)) {
    return false;
  }
  const data = error.data as Record<string, unknown> | null | undefined;
  const evidence = [error.message, data?.message, data?.details, data?.detail, data?.field]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (/\bmcp(?:\s+server|servers)?\b/i.test(evidence)) return true;
  return error.code === -32603 && error.message.trim().toLowerCase() === "internal error" && !data;
}

/**
 * Whether a `session/update` that arrives with no turn of ours open is the
 * agent doing real work.
 */
export function isOrphanTurnActivity(update: SessionUpdate): boolean {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = (update as { content?: ContentBlock }).content;
      return content?.type !== "text" || content.text.length > 0;
    }
    case "tool_call":
    case "tool_call_update": {
      const status = (update as { status?: string }).status;
      return status !== "completed" && status !== "failed";
    }
    case "agent_thought_chunk":
    case "plan":
      return true;
    default:
      return false;
  }
}

/**
 * Whether a mapped update batch is replacement-only: nonempty, and every event
 * repaints text of an already-allocated item (`content.delta` with `replace: true`).
 */
export function isReplacementOnlyDeltaBatch(events: RuntimeEvent[]): boolean {
  return (
    events.length > 0 &&
    events.every((event) => event.type === "content.delta" && event.replace === true)
  );
}

export class DroppedSessionUnrecoverableError extends Error {
  constructor(readonly originalError: unknown) {
    super(toErrorMessage(originalError), { cause: originalError });
    this.name = "DroppedSessionUnrecoverableError";
  }
}

/**
 * Build the ACP `initialize` request Poracode sends. Shared between the
 * dedicated per-thread transport and pooled shared processes so every
 * transport advertises identical client capabilities.
 */
export function buildAcpInitializeRequest(input: {
  readonly fsTextCapability: boolean;
  readonly terminalCapability: boolean;
  readonly booleanConfigOptions: boolean;
  readonly clientCapabilitiesMeta?: Record<string, unknown>;
  readonly initializeMeta?: Record<string, unknown>;
}): InitializeRequest {
  return {
    protocolVersion: PROTOCOL_VERSION,
    clientInfo: { name: "poracode", version: "0.1.0" },
    clientCapabilities: {
      fs: {
        readTextFile: input.fsTextCapability,
        writeTextFile: input.fsTextCapability,
      },
      elicitation: { form: {}, url: {} },
      terminal: input.terminalCapability,
      ...(input.booleanConfigOptions ? { session: { configOptions: { boolean: {} } } } : {}),
      ...(input.clientCapabilitiesMeta ? { _meta: input.clientCapabilitiesMeta } : {}),
    },
    ...(input.initializeMeta ? { _meta: input.initializeMeta } : {}),
  };
}
