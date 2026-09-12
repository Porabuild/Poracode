import type { EventEmitter } from "node:events";

function isBrokenPipeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as NodeJS.ErrnoException).code === "EPIPE" || error.message === "write EPIPE";
}

/**
 * A packaged desktop process can outlive the terminal or dev runner that
 * launched it. Once that owner closes its stdout/stderr pipe, later logging
 * emits EPIPE on the stream. Leave every other stream failure observable, but
 * do not let a detached diagnostic pipe take down (or exception-loop) the app.
 */
function handleStdioError(error: unknown): void {
  if (!isBrokenPipeError(error)) throw error;
}

type ProcessStdio = {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

export function installProcessStdioErrorHandlers(stdio: ProcessStdio = process): void {
  stdio.stdout.on("error", handleStdioError);
  stdio.stderr.on("error", handleStdioError);
}
