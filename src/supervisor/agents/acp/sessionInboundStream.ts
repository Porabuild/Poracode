import { RequestError, type AnyMessage, type Stream } from "@agentclientprotocol/sdk";

/** Canonical 8 MiB event ceiling plus bounded protocol wrapper space. */
export const ACP_INBOUND_FRAME_MAX_BYTES = 8 * 1024 * 1024 + 64 * 1024;
export const ACP_STDOUT_QUEUED_BYTES = 64 * 1024;

export class AcpInboundFrameLimitError extends Error {
  readonly code = "acp_inbound_frame_limit";
  constructor(
    readonly frameBytes: number,
    readonly maxBytes: number,
  ) {
    super(`ACP inbound JSON frame exceeded its byte limit (${frameBytes} > ${maxBytes}).`);
    this.name = "AcpInboundFrameLimitError";
  }
}

export interface AcpInboundStreamOptions {
  maxFrameBytes?: number;
  /** Future source gate: runs before another frame, including a buffered line. */
  beforeRead?(): Promise<void>;
  /** Synchronous hook after queued writes, immediately before issuing the encoded bytes. */
  onBeforeWrite?(message: AnyMessage): void;
  /** Metadata only; excludes the parsed message's separate downstream custody. */
  onRetainedBytes?(bytes: number): void;
}

/**
 * Pull-based ACP v1 framing. No background drain, no queue of parsed messages,
 * no whole-line UTF-8 re-encoding, and no repeated scan of earlier fragments.
 * A single JSON frame is bounded before copying/decoding its retained bytes.
 * This is a per-frame bound, not an aggregate source or SDK-handler bound:
 * sourceBackpressure must remain absent until those separate owners are gated.
 */
export function createAcpInboundStream(
  output: WritableStream<Uint8Array>,
  input: ReadableStream<Uint8Array>,
  options: AcpInboundStreamOptions = {},
): Stream {
  const max = options.maxFrameBytes ?? ACP_INBOUND_FRAME_MAX_BYTES;
  if (!Number.isSafeInteger(max) || max <= 0) throw new RangeError("Invalid ACP frame byte limit.");
  const reader = input.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let chunk: Uint8Array | null = null;
  let offset = 0;
  let cancelled = false;
  let released = false;
  let writeTail = Promise.resolve();
  const writeJson = (message: AnyMessage): Promise<void> => {
    // All SDK responses and framing errors share one ordered write chain.
    const bytes = encoder.encode(`${JSON.stringify(message)}\n`);
    const write = writeTail.then(async () => {
      const writer = output.getWriter();
      try {
        options.onBeforeWrite?.(message);
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    });
    writeTail = write.catch(() => {});
    return write;
  };
  const release = () => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  const retained = (bytes: number) => options.onRetainedBytes?.(bytes);

  async function readLine(): Promise<string | null> {
    const parts: Array<{ data: Uint8Array; used: number }> = [];
    let allocated = 0;
    let active: { data: Uint8Array; used: number } | null = null;
    const append = (piece: Uint8Array) => {
      let at = 0;
      while (at < piece.length) {
        if (active === null || active.used === active.data.length) {
          const capacity = Math.min(16 * 1024, max - allocated);
          if (capacity <= 0) throw new AcpInboundFrameLimitError(lineBytes, max);
          active = { data: new Uint8Array(capacity), used: 0 };
          parts.push(active);
          allocated += capacity;
          retained(allocated);
        }
        const count = Math.min(piece.length - at, active.data.length - active.used);
        active.data.set(piece.subarray(at, at + count), active.used);
        active.used += count;
        at += count;
      }
    };
    let lineBytes = 0;
    let kind: "unknown" | "json" | "noise" = "unknown";
    let prefix = "";
    let prefixDecoder: TextDecoder | null = null;
    try {
      for (;;) {
        if (chunk === null || offset === chunk.length) {
          const next = await reader.read();
          if (cancelled) return null;
          if (next.done) {
            chunk = null;
            if (kind !== "json") return null;
            break;
          }
          chunk = next.value;
          offset = 0;
          if (chunk.length === 0) continue;
        }
        const end = chunk.indexOf(10, offset);
        const limit = end < 0 ? chunk.length : end;
        let begin = offset;
        lineBytes += limit - begin;
        if (kind === "unknown") {
          // Probe only the leading characters. The usual '{' path needs no
          // prefix decoding; split Unicode whitespace keeps decoder state.
          while (begin < limit && kind === "unknown") {
            const byte = chunk[begin]!;
            if (prefixDecoder === null && byte === 123) {
              kind = "json";
              break;
            }
            if (prefixDecoder === null && (byte === 32 || byte === 9 || byte === 13)) {
              begin++;
              continue;
            }
            prefix += (prefixDecoder ??= new TextDecoder()).decode(
              chunk.subarray(begin, begin + 1),
              { stream: true },
            );
            begin++;
            const first = prefix.trimStart();
            if (first) {
              kind = first.startsWith("{") ? "json" : "noise";
            } else if (prefix) prefix = "";
          }
        }
        if (kind === "json") {
          if (lineBytes > max) throw new AcpInboundFrameLimitError(lineBytes, max);
          // Non-ASCII prefix classification never consumes '{' in practice;
          // retain its decoded prefix if it did, preserving parser semantics.
          if (prefix.trimStart().startsWith("{")) {
            const head = encoder.encode(prefix.trimStart());
            append(head);
            prefix = "";
          }
          const piece = chunk.subarray(begin, limit);
          if (end >= 0 && parts.length === 0) {
            // Complete single-chunk frame: decode its borrowed view immediately.
            parts.push({ data: piece, used: piece.length });
            retained(piece.length);
          } else append(piece);
        }
        offset = end < 0 ? limit : end + 1;
        if (end >= 0) {
          if (kind === "json") break;
          // Startup diagnostics and empty lines do not allocate a line buffer.
          lineBytes = 0;
          prefix = "";
          kind = "unknown";
          prefixDecoder?.decode();
          prefixDecoder = null;
        }
      }
      const text: string[] = [];
      for (const part of parts)
        text.push(decoder.decode(part.data.subarray(0, part.used), { stream: true }));
      text.push(decoder.decode());
      return text.join("").trim();
    } finally {
      parts.length = 0;
      retained(0);
    }
  }

  const readable = new ReadableStream<AnyMessage>(
    {
      async pull(controller) {
        try {
          for (;;) {
            if (options.beforeRead) await options.beforeRead();
            if (cancelled) return;
            const line = await readLine();
            if (cancelled) return;
            if (line === null) {
              release();
              controller.close();
              return;
            }
            let message: unknown;
            try {
              message = JSON.parse(line);
            } catch {
              const error = RequestError.parseError();
              await writeJson({ jsonrpc: "2.0", id: null, error: error.toErrorResponse() });
              continue;
            }
            if (typeof message === "object" && message !== null) {
              const record = message as Record<string, unknown>;
              if (!("method" in record) && record.id === "skills-reload") continue;
              controller.enqueue(message as AnyMessage);
              return;
            }
          }
        } catch (error) {
          if (cancelled) return;
          chunk = null;
          await reader.cancel(error).catch(() => {});
          release();
          controller.error(error);
        }
      },
      async cancel(reason) {
        cancelled = true;
        chunk = null;
        try {
          await reader.cancel(reason);
        } finally {
          release();
          retained(0);
        }
      },
    },
    { highWaterMark: 0 },
  );
  return { readable, writable: new WritableStream<AnyMessage>({ write: writeJson }) };
}
