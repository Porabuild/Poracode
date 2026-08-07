/**
 * Tolerant readers for Grok's ACP session notifications.
 *
 * Grok carries its extensions (goals, subagents, backend web search) as loose
 * JSON on `SessionNotification.update`, so the transforms treat every field as
 * unknown and narrow it here rather than trusting the SDK types.
 */

import type { SessionNotification } from "@agentclientprotocol/sdk";

export function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function withUpdate(
  notification: SessionNotification,
  update: Record<string, unknown>,
): SessionNotification {
  return { ...notification, update: update as SessionNotification["update"] };
}
