import type { ChildProcess } from "node:child_process";
import { decodePowerShellClixml } from "../base/powershellClixml";

export interface CodexStdioTransportListener {
  onMessage(message: unknown): void;
  onClose(): void;
  onError(error: Error): void;
}

function formatJsonRpcStdoutLine(line: string): string {
  return line.length > 500 ? `${line.slice(0, 500)}...` : line;
}

/**
 * Codex app-server speaks JSON-RPC 2.0 as one JSON object per stdout line.
 * Stderr is process diagnostics only; it must never be fed into the protocol.
 */
export class CodexStdioTransport {
  private stdoutBuffer = "";
  private readonly outputChunks: string[] = [];
  private listener: CodexStdioTransportListener | undefined;
  private disposed = false;

  constructor(private readonly child: ChildProcess) {
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => this.handleStdout(String(chunk)));
    child.stderr?.on("data", (chunk) => this.recordOutput(String(chunk)));
    child.once("error", (error) => {
      if (!this.disposed) {
        this.listener?.onError(error);
      }
    });
    child.once("exit", () => {
      if (this.stdoutBuffer.trim().length > 0) {
        this.recordOutput(`Unterminated stdout: ${formatJsonRpcStdoutLine(this.stdoutBuffer)}`);
        this.stdoutBuffer = "";
      }
      if (!this.disposed) {
        this.listener?.onClose();
      }
    });
  }

  setListener(listener: CodexStdioTransportListener): void {
    this.listener = listener;
  }

  write(message: Record<string, unknown>): void {
    if (this.disposed) {
      throw new Error("Codex app-server stdio transport is disposed.");
    }
    if (!this.child.stdin?.writable) {
      throw new Error("Codex app-server stdin is not writable.");
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
    // On Windows the app-server may be launched through PowerShell, whose
    // errors arrive on stderr as CLIXML; decode them so callers surface the
    // real message (e.g. "The term '…codex.cmd' is not recognized").
    const text = decodePowerShellClixml(this.outputChunks.join("")).trim();
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
        this.recordOutput(`Invalid JSON-RPC stdout: ${formatJsonRpcStdoutLine(line)}\n`);
      }
    }
  }

  private recordOutput(text: string): void {
    this.outputChunks.push(text);
    if (this.outputChunks.length > 12) {
      this.outputChunks.shift();
    }
  }
}
