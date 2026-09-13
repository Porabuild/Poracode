import type { ComputerUseWindow } from "../mcp/types";
import type { NativeProcessRun } from "./nativeProcessRunner";

// Reads the pixel dimensions encoded in a PNG's IHDR chunk (width at byte 16,
// height at byte 20, both big-endian uint32). Returns null for non-PNG or
// truncated buffers.
export function readPngPixelSize(bytes: Buffer): { width: number; height: number } | null {
  const PNG_SIGNATURE = "\x89PNG\r\n\x1a\n";
  if (bytes.length < 24) return null;
  if (bytes.toString("latin1", 0, 8) !== PNG_SIGNATURE) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function hashWindowId(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeWindows(value: unknown): ComputerUseWindow[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const windows: ComputerUseWindow[] = [];
  for (const item of items) {
    const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const app = typeof obj.app === "string" ? obj.app : "";
    const title = typeof obj.title === "string" ? obj.title : undefined;
    const x = typeof obj.x === "number" ? obj.x : 0;
    const y = typeof obj.y === "number" ? obj.y : 0;
    const width = typeof obj.width === "number" ? obj.width : 0;
    const height = typeof obj.height === "number" ? obj.height : 0;
    // Per-process identity, captured in listMacWindows (unix pid + the window's
    // ordinal within that process). We hash on these instead of geometry so the
    // id stays stable when the user moves or resizes the window. Geometry below
    // is reported for display/coordinate math only.
    const pid = typeof obj.pid === "number" ? obj.pid : 0;
    const index = typeof obj.index === "number" ? obj.index : 0;
    if (!app || width <= 0 || height <= 0) continue;
    windows.push({
      app,
      id: hashWindowId(`${app}\n${pid}\n${index}`),
      ...(title ? { title } : {}),
      x,
      y,
      width,
      height,
    });
  }
  return windows;
}

async function osascript<T>(runProcess: NativeProcessRun, script: string): Promise<T> {
  const { stdout } = await runProcess("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
    timeoutMs: 15_000,
  });
  return JSON.parse(stdout.trim()) as T;
}

// `appFilter` (exact process-name match, same resolution the unfiltered path
// uses) lets interactive actions skip enumerating every visible process's
// windows — System Events window queries are Apple Events round-trips and are
// by far the slowest part of each action. list_windows/list_apps pass no
// filter and keep the full enumeration.
export async function listMacWindows(
  runProcess: NativeProcessRun,
  appFilter?: string,
): Promise<ComputerUseWindow[]> {
  const raw = await osascript<unknown>(
    runProcess,
    `
ObjC.import("stdlib");
const app = Application("System Events");
const appFilter = ${JSON.stringify(appFilter ?? null)};
const windows = [];
for (const process of app.applicationProcesses()) {
  if (!process.visible()) continue;
  const appName = process.name();
  if (appFilter !== null && appName !== appFilter) continue;
  let pid = 0;
  try { pid = Number(process.unixId()) || 0; } catch {}
  const procWindows = process.windows();
  for (let index = 0; index < procWindows.length; index += 1) {
    const window = procWindows[index];
    let position = [0, 0];
    let size = [0, 0];
    try { position = window.position(); } catch {}
    try { size = window.size(); } catch {}
    let title = "";
    try { title = window.name(); } catch {}
    windows.push({
      app: appName,
      pid,
      index,
      title,
      x: Number(position[0]) || 0,
      y: Number(position[1]) || 0,
      width: Number(size[0]) || 0,
      height: Number(size[1]) || 0,
    });
  }
}
JSON.stringify(windows);
`,
  );
  return normalizeWindows(raw);
}

export function keyCodeForToken(token: string): number | undefined {
  const t = token.trim().toLowerCase();
  const map: Record<string, number> = {
    return: 36,
    enter: 36,
    tab: 48,
    escape: 53,
    esc: 53,
    delete: 51,
    backspace: 51,
    left: 123,
    arrowleft: 123,
    right: 124,
    arrowright: 124,
    down: 125,
    arrowdown: 125,
    up: 126,
    arrowup: 126,
    home: 115,
    end: 119,
    pageup: 116,
    page_up: 116,
    pagedown: 121,
    page_down: 121,
    space: 49,
  };
  if (map[t] !== undefined) return map[t];
  const fKey = /^f([1-9]|1[0-9]|2[0])$/.exec(t);
  if (fKey) {
    const codes = [
      122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79, 80, 90,
    ];
    return codes[Number(fKey[1]) - 1];
  }
  return undefined;
}

export function modifierForToken(token: string): string | undefined {
  const t = token.trim().toLowerCase();
  if (t === "control" || t === "ctrl" || t === "control_l" || t === "control_r")
    return "control down";
  if (t === "shift" || t === "shift_l" || t === "shift_r") return "shift down";
  if (t === "alt" || t === "option" || t === "alt_l" || t === "alt_r") return "option down";
  if (t === "command" || t === "cmd" || t === "meta") return "command down";
  return undefined;
}

export function quoteAppleScript(value: string): string {
  return JSON.stringify(value);
}

export async function runAppleScript(runProcess: NativeProcessRun, script: string): Promise<void> {
  await runProcess("/usr/bin/osascript", ["-e", script], { timeoutMs: 10_000 });
}

export async function activateApp(runProcess: NativeProcessRun, app: string): Promise<void> {
  await runAppleScript(
    runProcess,
    `
tell application "System Events"
  set frontmost of first application process whose name is ${quoteAppleScript(app)} to true
end tell
`,
  );
}

export async function getMacWindow(
  runProcess: NativeProcessRun,
  input: { app?: string; id: number },
): Promise<ComputerUseWindow> {
  const windows = await listMacWindows(runProcess, input.app);
  const window = windows.find(
    (candidate) =>
      candidate.id === input.id && (input.app === undefined || candidate.app === input.app),
  );
  if (!window) throw new Error("Window is no longer available.");
  return window;
}
