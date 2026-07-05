/**
 * Filters applied to the raw ndjson stream between us and the ACP agent
 * process, before any message reaches the SDK connection.
 */
import { ndJsonStream, type SessionNotification } from "@agentclientprotocol/sdk";

export function looksLikeAcpSessionNotification(params: unknown): params is SessionNotification {
  if (!params || typeof params !== "object") return false;
  const p = params as { sessionId?: unknown; update?: unknown };
  if (typeof p.sessionId !== "string") return false;
  if (!p.update || typeof p.update !== "object") return false;
  return typeof (p.update as { sessionUpdate?: unknown }).sessionUpdate === "string";
}

function isStraySkillsReloadResponse(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return !("method" in record) && record.id === "skills-reload";
}

export function filterAcpInboundNoise(
  stream: ReturnType<typeof ndJsonStream>,
): ReturnType<typeof ndJsonStream> {
  return {
    writable: stream.writable,
    readable: stream.readable.pipeThrough(
      new TransformStream({
        transform(message, controller) {
          if (isStraySkillsReloadResponse(message)) return;
          controller.enqueue(message);
        },
      }),
    ) as ReturnType<typeof ndJsonStream>["readable"],
  };
}
