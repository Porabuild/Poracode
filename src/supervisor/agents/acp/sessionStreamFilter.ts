/**
 * Filters applied to the raw ndjson stream between us and the ACP agent
 * process, before any message reaches the SDK connection.
 */
import { ndJsonStream, type SessionNotification } from "@agentclientprotocol/sdk";

/**
 * ACP stdio is newline-delimited JSON, but some agents occasionally print a
 * human-readable diagnostic to stdout during startup. Drop lines that cannot
 * possibly be JSON-RPC objects before the SDK parser sees them; object-shaped
 * malformed JSON still reaches the SDK and retains its normal diagnostics.
 */
export function filterAcpStdoutNonJsonLines(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";

  const emitLine = (
    line: string,
    hasNewline: boolean,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) => {
    if (line.trimStart().startsWith("{")) {
      controller.enqueue(encoder.encode(hasNewline ? `${line}\n` : line));
    }
  };

  return input.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        let newlineIndex = pending.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = pending.slice(0, newlineIndex).replace(/\r$/u, "");
          pending = pending.slice(newlineIndex + 1);
          emitLine(line, true, controller);
          newlineIndex = pending.indexOf("\n");
        }
      },
      flush(controller) {
        pending += decoder.decode();
        if (pending.length > 0) emitLine(pending.replace(/\r$/u, ""), false, controller);
      },
    }),
  );
}

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
