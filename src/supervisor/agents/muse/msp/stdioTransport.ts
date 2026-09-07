import type { ChildProcess } from "node:child_process";
import type {
  MspRpcErrorFrame,
  MspRpcNotification,
  MspRpcRequest,
  MspRpcSuccess,
} from "./protocol";

export interface MuseMspTransportListener {
  onMessage(message: unknown): void;
  onClose(): void;
  onError(error: Error): void;
}

/** Minimal transport surface the MSP client speaks (seam for tests). */
export interface MuseMspTransport {
  write(message: MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame): void;
  setListener(listener: MuseMspTransportListener): void;
  dispose(): void;
}

function formatStdoutLine(line: string): string {
  return line.length > 500 ? `${line.slice(0, 500)}...` : line;
}

/**
 * `muse serve` speaks newline-delimited JSON-RPC 2.0 on stdout (verified
 * against real 1.0.2 output). Stderr is process diagnostics only; it must
 * never be fed into the protocol. Muse-owned transport — mirrors the Codex
 * app-server shape without importing it (provider isolation).
 */
export class MuseMspStdioTransport implements MuseMspTransport {
  private stdoutBuffer = "";
  private readonly outputChunks: string[] = [];
  private listener: MuseMspTransportListener | undefined;
  private disposed = false;
  private errorReported = false;

  constructor(private readonly child: ChildProcess) {
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => this.handleStdout(String(chunk)));
    child.stderr?.on("data", (chunk) => this.recordOutput(String(chunk)));
    child.once("error", (error) => this.reportError(error));
    child.stdin?.on("error", (error) => this.reportError(error));
    child.once("close", () => {
      if (this.stdoutBuffer.trim().length > 0) {
        this.recordOutput(`Unterminated stdout: ${formatStdoutLine(this.stdoutBuffer)}`);
        this.stdoutBuffer = "";
      }
      if (!this.disposed) {
        this.listener?.onClose();
      }
    });
  }

  setListener(listener: MuseMspTransportListener): void {
    this.listener = listener;
  }

  write(message: MspRpcRequest | MspRpcNotification | MspRpcSuccess | MspRpcErrorFrame): void {
    if (this.disposed) {
      throw new Error("Muse MSP stdio transport is disposed.");
    }
    if (!this.child.stdin?.writable) {
      throw new Error("Muse MSP server stdin is not writable.");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.child.stdin?.end();
    } catch {
      // Ignore teardown races.
    }
  }

  getOutputChunks(): string[] {
    return [...this.outputChunks];
  }

  formatOutput(): string {
    const text = this.outputChunks.join("").trim();
    return text ? ` Output: ${text}` : "";
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    for (;;) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.trim().length === 0) {
        continue;
      }

      try {
        this.listener?.onMessage(JSON.parse(line));
      } catch {
        this.recordOutput(`Invalid MSP stdout: ${formatStdoutLine(line)}\n`);
      }
    }
  }

  private recordOutput(text: string): void {
    this.outputChunks.push(text);
    if (this.outputChunks.length > 12) {
      this.outputChunks.shift();
    }
  }

  private reportError(error: Error): void {
    if (this.disposed || this.errorReported) return;
    this.errorReported = true;
    this.listener?.onError(error);
  }
}
