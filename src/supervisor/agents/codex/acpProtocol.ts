import type {
  ThreadAttention,
  ThreadServerRequestId,
  ThreadStatus as CanonicalThreadStatus,
} from "@/shared/contracts";
import type { ThreadStatus as CodexProtocolThreadStatus } from "./protocol";

export type CodexThreadStatus = CodexProtocolThreadStatus;

export type CodexSocketMessage =
  | {
      kind: "response";
      id: string;
      result?: unknown;
      error?: unknown;
    }
  | {
      kind: "request";
      id: string | number;
      method: string;
      params?: Record<string, unknown>;
    }
  | {
      kind: "notification";
      method: string;
      params?: Record<string, unknown>;
    }
  | {
      kind: "unknown";
    };

export function toCodexSandboxPolicy(
  mode: string | undefined,
): { type: "readOnly" } | { type: "workspaceWrite" } | { type: "dangerFullAccess" } | undefined {
  switch (mode) {
    case "read-only":
      return { type: "readOnly" };
    case "workspace-write":
      return { type: "workspaceWrite" };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      return undefined;
  }
}

export function extractThreadField(result: unknown, field: string): string | undefined {
  return extractObjectStringField(result, "thread", field);
}

export function extractTurnField(result: unknown, field: string): string | undefined {
  return extractObjectStringField(result, "turn", field);
}

function extractObjectStringField(
  result: unknown,
  objectField: string,
  field: string,
): string | undefined {
  if (!result || typeof result !== "object" || !(objectField in result)) {
    return undefined;
  }
  const object = (result as Record<string, unknown>)[objectField];
  if (!object || typeof object !== "object" || !(field in object)) {
    return undefined;
  }
  const value = (object as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

export function deriveCodexStructuredState(status: CodexThreadStatus): {
  status: CanonicalThreadStatus;
  attention: ThreadAttention;
} {
  if (status.type === "systemError") {
    return {
      status: "error",
      attention: "error",
    };
  }

  if (status.type === "idle") {
    return {
      status: "idle",
      attention: "none",
    };
  }

  if (status.type === "notLoaded") {
    return {
      status: "inactive",
      attention: "none",
    };
  }

  const activeFlags = new Set(status.activeFlags ?? []);
  if (activeFlags.has("waitingOnApproval")) {
    return {
      status: "needs_approval",
      attention: "needs_approval",
    };
  }

  if (activeFlags.has("waitingOnUserInput")) {
    return {
      status: "needs_reply",
      attention: "needs_reply",
    };
  }

  return {
    status: "working",
    attention: "working",
  };
}

export function parseCodexSocketMessage(payload: unknown): CodexSocketMessage {
  if (!payload || typeof payload !== "object") {
    return { kind: "unknown" };
  }

  const message = payload as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : undefined;
  const params =
    typeof message.params === "object" && message.params !== null
      ? (message.params as Record<string, unknown>)
      : undefined;

  if (method) {
    if ("id" in message) {
      return {
        kind: "request",
        id: message.id as ThreadServerRequestId,
        method,
        ...(params ? { params } : {}),
      };
    }

    return {
      kind: "notification",
      method,
      ...(params ? { params } : {}),
    };
  }

  if ("id" in message) {
    return {
      kind: "response",
      id: String(message.id),
      ...("result" in message ? { result: message.result } : {}),
      ...("error" in message ? { error: message.error } : {}),
    };
  }

  return { kind: "unknown" };
}

/**
 * Pull a human-readable message out of a Codex `thread/status/changed` payload
 * when the new status is `systemError`. Codex's typed shape carries no message
 * field, but observed wire payloads sometimes include `message`, `error`, or a
 * nested `details` blob.
 */
export function extractCodexStatusErrorMessage(status: unknown): string {
  if (status && typeof status === "object") {
    const record = status as Record<string, unknown>;
    const direct = record.message ?? record.error ?? record.reason ?? record.detail;
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct;
    }
    const details = record.details;
    if (details && typeof details === "object") {
      const nested = (details as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim().length > 0) {
        return nested;
      }
    }
  }
  return "Codex reported a system error. The session may be out of usage or otherwise unable to continue.";
}

export function isRecoverableResumeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("missing thread") ||
    lower.includes("unknown thread") ||
    lower.includes("no session") ||
    lower.includes("expired") ||
    lower.includes("invalid thread") ||
    lower.includes("session not found")
  );
}
