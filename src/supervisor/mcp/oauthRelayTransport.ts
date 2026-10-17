import type { IncomingHttpHeaders } from "node:http";
import { Transform, type TransformCallback } from "node:stream";

const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** Each leg owns its connection and credentials; end-to-end MCP headers pass through. */
export function relayRequestHeaders(headers: IncomingHttpHeaders): Headers {
  const out = new Headers();
  const connectionHeaders = new Set(headers.connection?.toLowerCase().split(/\s*,\s*/u));
  for (const [name, value] of Object.entries(headers)) {
    if (
      HOP_HEADERS.has(name) ||
      connectionHeaders.has(name) ||
      name === "authorization" ||
      name === "cookie" ||
      name === "origin" ||
      name === "x-poracode-token" ||
      value === undefined
    )
      continue;
    out.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  // Node fetch decodes compressed bodies, so don't negotiate compression on this leg.
  out.set("accept-encoding", "identity");
  return out;
}

export function relayResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const connectionHeaders = new Set(
    headers
      .get("connection")
      ?.toLowerCase()
      .split(/\s*,\s*/u),
  );
  headers.forEach((value, name) => {
    if (
      HOP_HEADERS.has(name) ||
      connectionHeaders.has(name) ||
      name === "content-encoding" ||
      name === "set-cookie" ||
      name === "www-authenticate" ||
      name.startsWith("access-control-")
    )
      return;
    out[name] = value;
  });
  return out;
}

/**
 * Legacy SSE advertises its POST endpoint in the initial `endpoint` event.
 * Rewrite only that event; subsequent messages stream byte-for-byte without
 * buffering tool results or changing the negotiated MCP protocol.
 */
export class RelaySseEndpoint extends Transform {
  private pending: Buffer = Buffer.alloc(0);
  private rewritten = false;
  private firstBlock = true;

  constructor(private readonly rewrite: (url: string) => string) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.rewritten) {
      callback(null, chunk);
      return;
    }
    try {
      this.pending = Buffer.concat([this.pending, chunk]);
      // Latin-1 keeps delimiter indices aligned with bytes. Decode only a
      // complete endpoint event; a following message may end mid-UTF-8 codepoint.
      let separator = /(?:\r\n|\r(?!\n)|(?<!\r)\n){2}/u.exec(this.pending.toString("latin1"));
      while (separator) {
        const block = this.pending.slice(0, separator.index);
        this.pending = this.pending.slice(separator.index + separator[0].length);
        const text = block.toString("utf8");
        const lines = (this.firstBlock ? text.replace(/^\uFEFF/u, "") : text).split(/\r\n|\r|\n/u);
        this.firstBlock = false;
        if (lines.some((line) => /^event:\s*endpoint\s*$/u.test(line))) {
          const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(/^ /u, ""))
            .join("\n");
          this.push(
            `${lines.filter((line) => !line.startsWith("data:")).join("\n")}\ndata: ${this.rewrite(data)}\n\n`,
          );
          this.rewritten = true;
          this.push(this.pending);
          this.pending = Buffer.alloc(0);
          break;
        }
        this.push(block);
        this.push(separator[0]);
        separator = /(?:\r\n|\r(?!\n)|(?<!\r)\n){2}/u.exec(this.pending.toString("latin1"));
      }
      if (!this.rewritten && this.pending.length > 64 * 1024) {
        throw new Error("Invalid MCP SSE endpoint event.");
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: TransformCallback): void {
    if (!this.rewritten) this.push(this.pending);
    callback();
  }
}
