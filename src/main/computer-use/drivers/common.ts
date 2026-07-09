import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ComputerUseWindow } from "../mcp/types";

const execFileAsync = promisify(execFile);

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
  // Number("")/Number(null)/Number("  ")/Number(true) all coerce to a finite
  // number, so a missing coordinate would silently become 0 (a top-left click).
  // Require a real number or a strictly-numeric string before coercing.
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${name} is required`);
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new Error(`${name} is required`);
    const next = Number(trimmed);
    if (!Number.isFinite(next)) throw new Error(`${name} is required`);
    return next;
  }
  throw new Error(`${name} is required`);
}

export function readString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

export function runProcess(
  command: string,
  args: string[],
  options?: {
    timeoutMs?: number;
    maxBufferBytes?: number;
  },
): Promise<{ stdout: string; stderr: string }> {
  // Native execFile enforces timeout/maxBuffer and appends stderr to the
  // thrown error's message ("Command failed: <cmd>\n<stderr>"), so failures
  // still surface the process's own diagnostics.
  return execFileAsync(command, args, {
    windowsHide: true,
    maxBuffer: options?.maxBufferBytes ?? 12 * 1024 * 1024,
    ...(options?.timeoutMs !== undefined && options.timeoutMs > 0
      ? { timeout: options.timeoutMs }
      : {}),
  });
}
