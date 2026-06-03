import { spawn } from "node:child_process";
import type { ComputerUseWindow } from "../mcp/types";

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readWindow(value: unknown): ComputerUseWindow {
  const obj = readRecord(value);
  const id = Number(obj.id);
  const app = typeof obj.app === "string" ? obj.app : "";
  if (!Number.isFinite(id) || !app) {
    throw new Error("window with app and id is required");
  }
  return {
    app,
    id,
    ...(typeof obj.title === "string" ? { title: obj.title } : {}),
    ...(typeof obj.x === "number" ? { x: obj.x } : {}),
    ...(typeof obj.y === "number" ? { y: obj.y } : {}),
    ...(typeof obj.width === "number" ? { width: obj.width } : {}),
    ...(typeof obj.height === "number" ? { height: obj.height } : {}),
  };
}

export function readNumber(value: unknown, name: string): number {
  const next = Number(value);
  if (!Number.isFinite(next)) throw new Error(`${name} is required`);
  return next;
}

export function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

export function runProcess(
  command: string,
  args: string[],
  options?: {
    input?: string;
    timeoutMs?: number;
    maxBufferBytes?: number;
  },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const maxBufferBytes = options?.maxBufferBytes ?? 12 * 1024 * 1024;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
          }, options.timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        child.kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBufferBytes) stderr.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (stdoutBytes > maxBufferBytes) {
        reject(new Error(`${command} output exceeded ${maxBufferBytes} bytes`));
        return;
      }
      if (code !== 0) {
        reject(new Error(err.trim() || `${command} exited with code ${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
    if (options?.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}
