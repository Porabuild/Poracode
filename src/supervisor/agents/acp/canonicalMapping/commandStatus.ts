import type { SessionNotification } from "@agentclientprotocol/sdk";

/**
 * Declares that a command tool's text content is a completion status line,
 * not command output. Providers parse their formats; the mapper never parses vendor text.
 */
export const PORACODE_ACP_COMMAND_STATUS_META_KEY = "poracodeCommandStatus";

/** Exit code reported by the declared completion status line, when available. */
export interface AcpCommandStatus {
  readonly exitCode?: number;
}

/** Attach a provider-interpreted command completion status to a notification. */
export function withAcpCommandStatus(
  notification: SessionNotification,
  status: AcpCommandStatus,
): SessionNotification {
  const update = notification.update as Record<string, unknown>;
  const meta = isPlainObject(update._meta) ? update._meta : {};
  return {
    ...notification,
    update: {
      ...update,
      _meta: { ...meta, [PORACODE_ACP_COMMAND_STATUS_META_KEY]: status },
    } as unknown as SessionNotification["update"],
  };
}

/** Read a declared command status; absent or malformed declarations are undefined. */
export function readAcpCommandStatus(meta: unknown): AcpCommandStatus | undefined {
  if (!isPlainObject(meta)) return undefined;
  if (!Object.hasOwn(meta, PORACODE_ACP_COMMAND_STATUS_META_KEY)) return undefined;
  const value = meta[PORACODE_ACP_COMMAND_STATUS_META_KEY];
  if (!isPlainObject(value)) return undefined;
  const exitCode = Object.hasOwn(value, "exitCode") ? value.exitCode : undefined;
  return typeof exitCode === "number" && Number.isSafeInteger(exitCode) ? { exitCode } : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
