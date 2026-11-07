import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/core";
import {
  STDIO_DEFAULT_MAX_BUFFER_SIZE,
  type JSONRPCMessage,
  type Transport,
} from "@modelcontextprotocol/server";
import { terminateChildProcessTree } from "@/shared/processTree";

type Framing = "line" | "content-length";

/** Native clients may probe both MCP newline and legacy Content-Length framing. */
export class McpFramedTransport implements Transport {
  onmessage?: Transport["onmessage"];
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  framing: Framing = "line";
  private buffer: Buffer = Buffer.alloc(0);
  private started = false;
  private closed = false;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly writeFraming?: () => Framing,
  ) {}

  async start(): Promise<void> {
    if (this.started) throw new Error("MCP stdio transport already started");
    this.started = true;
    this.input.on("data", this.read);
    this.input.once("end", this.ended);
    this.input.on("error", this.failed);
    // Keep the error listener through late write callbacks after closure.
    this.output.on("error", this.failed);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error("MCP stdio transport closed");
    const body = JSON.stringify(message);
    const frame =
      (this.writeFraming?.() ?? this.framing) === "content-length"
        ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
        : `${body}\n`;
    await new Promise<void>((resolve, reject) =>
      this.output.write(frame, (error) => (error ? reject(error) : resolve())),
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.buffer = Buffer.alloc(0);
    this.input.off("data", this.read);
    this.input.off("end", this.ended);
    this.input.off("error", this.failed);
    this.input.pause();
    this.onclose?.();
  }

  private readonly ended = () => {
    void this.close();
  };
  private readonly failed = (error: Error) => {
    if (this.closed) return;
    this.onerror?.(error);
    void this.close();
  };
  private readonly read = (chunk: Buffer | string) => {
    if (this.closed) return;
    try {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      ]);
      while (this.buffer.length > 0) {
        const prefix = this.buffer.subarray(0, 15).toString("ascii").toLowerCase();
        let body: Buffer;
        if ("content-length:".startsWith(prefix) && prefix.length < 15) break;
        if (prefix.startsWith("content-length:")) {
          const end = this.buffer.indexOf("\r\n\r\n");
          if (end < 0) break;
          const header = this.buffer.subarray(0, end).toString("ascii");
          const length = Number(/^content-length:\s*(\d+)\s*$/im.exec(header)?.[1]);
          if (!Number.isSafeInteger(length) || length < 0 || length > STDIO_DEFAULT_MAX_BUFFER_SIZE)
            throw new Error("Invalid MCP Content-Length");
          if (this.buffer.length < end + 4 + length) break;
          body = this.buffer.subarray(end + 4, end + 4 + length);
          this.buffer = this.buffer.subarray(end + 4 + length);
          this.framing = "content-length";
        } else {
          const end = this.buffer.indexOf(10);
          if (end < 0) break;
          if (end > STDIO_DEFAULT_MAX_BUFFER_SIZE) throw new Error("MCP stdio frame too large");
          body = this.buffer.subarray(0, end);
          this.buffer = this.buffer.subarray(end + 1);
          if (!body.toString("utf8").trim()) continue;
          this.framing = "line";
        }
        this.onmessage?.(JSONRPCMessageSchema.parse(JSON.parse(body.toString("utf8"))));
        if (this.closed) return;
      }
      if (this.buffer.length > STDIO_DEFAULT_MAX_BUFFER_SIZE)
        throw new Error("MCP stdio frame too large");
    } catch (error) {
      this.failed(
        error instanceof Error ? error : new Error("Invalid MCP stdio frame", { cause: error }),
      );
    }
  };
}

/** Own the same native stdio subprocess while allowing either negotiated framing. */
export function createFramedMcpChild(options: {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  framing(): Framing;
}): Transport {
  let child: ChildProcess | undefined;
  let stream: McpFramedTransport | undefined;
  let stopping: Promise<void> | undefined;
  let notified = false;
  const notifyClosed = () => {
    if (!notified) {
      notified = true;
      transport.onclose?.();
    }
  };
  const transport: Transport = {
    async start() {
      child = spawn(options.command, options.args, {
        env: options.env,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        stdio: ["pipe", "pipe", "inherit"],
        windowsHide: true,
      });
      if (!child.stdout || !child.stdin) throw new Error("MCP subprocess pipes unavailable");
      stream = new McpFramedTransport(child.stdout, child.stdin, options.framing);
      stream.onmessage = (message) => transport.onmessage?.(message);
      stream.onerror = (error) => transport.onerror?.(error);
      stream.onclose = notifyClosed;
      // Drain final stdout frames before reporting subprocess closure.
      child.once("close", notifyClosed);
      child.on("error", (error) => transport.onerror?.(error));
      await stream.start();
      if (!child.pid) throw new Error("MCP subprocess failed to start");
    },
    async send(message) {
      if (!stream) throw new Error("MCP subprocess not started");
      await stream.send(message);
    },
    close() {
      stopping ??= Promise.resolve().then(async () => {
        await stream?.close();
        if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, "exit");
        child.stdin?.end();
        terminateChildProcessTree(child);
        const timer = setTimeout(() => child?.kill("SIGKILL"), 1000);
        timer.unref();
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      });
      return stopping;
    },
  };
  return transport;
}
