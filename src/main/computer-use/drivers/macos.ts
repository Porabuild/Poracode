import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { readNumber, runProcess } from "./common";

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
    if (!app || width <= 0 || height <= 0) continue;
    windows.push({
      app,
      id: hashWindowId(`${app}\n${title ?? ""}\n${x},${y},${width},${height}`),
      ...(title ? { title } : {}),
      x,
      y,
      width,
      height,
    });
  }
  return windows;
}

async function osascript<T>(script: string): Promise<T> {
  const { stdout } = await runProcess("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
    timeoutMs: 15_000,
  });
  return JSON.parse(stdout.trim()) as T;
}

async function listMacWindows(): Promise<ComputerUseWindow[]> {
  const raw = await osascript<unknown>(`
ObjC.import("stdlib");
const app = Application("System Events");
const windows = [];
for (const process of app.applicationProcesses()) {
  if (!process.visible()) continue;
  const appName = process.name();
  for (const window of process.windows()) {
    let position = [0, 0];
    let size = [0, 0];
    try { position = window.position(); } catch {}
    try { size = window.size(); } catch {}
    let title = "";
    try { title = window.name(); } catch {}
    windows.push({
      app: appName,
      title,
      x: Number(position[0]) || 0,
      y: Number(position[1]) || 0,
      width: Number(size[0]) || 0,
      height: Number(size[1]) || 0,
    });
  }
}
JSON.stringify(windows);
`);
  return normalizeWindows(raw);
}

function keyCodeForToken(token: string): number | undefined {
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

function modifierForToken(token: string): string | undefined {
  const t = token.trim().toLowerCase();
  if (t === "control" || t === "ctrl" || t === "control_l" || t === "control_r")
    return "control down";
  if (t === "shift" || t === "shift_l" || t === "shift_r") return "shift down";
  if (t === "alt" || t === "option" || t === "alt_l" || t === "alt_r") return "option down";
  if (t === "command" || t === "cmd" || t === "meta") return "command down";
  return undefined;
}

function quoteAppleScript(value: string): string {
  return JSON.stringify(value);
}

async function runAppleScript(script: string): Promise<void> {
  await runProcess("/usr/bin/osascript", ["-e", script], { timeoutMs: 10_000 });
}

async function activateApp(app: string): Promise<void> {
  await runAppleScript(`
tell application "System Events"
  set frontmost of first application process whose name is ${quoteAppleScript(app)} to true
end tell
`);
}

export class MacComputerUseDriver implements ComputerUseDriver {
  async listApps(): Promise<ComputerUseApp[]> {
    const windows = await listMacWindows();
    const groups = new Map<string, ComputerUseWindow[]>();
    for (const window of windows) {
      const prev = groups.get(window.app) ?? [];
      prev.push(window);
      groups.set(window.app, prev);
    }
    return [...groups.entries()].map(([id, appWindows]) => ({
      id,
      displayName: id,
      isRunning: true,
      windows: appWindows,
    }));
  }

  listWindows(): Promise<ComputerUseWindow[]> {
    return listMacWindows();
  }

  async getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow> {
    const windows = await listMacWindows();
    const window = windows.find(
      (candidate) =>
        candidate.id === input.id && (input.app === undefined || candidate.app === input.app),
    );
    if (!window) throw new Error("Window is no longer available.");
    return window;
  }

  async getWindowState(input: {
    include_screenshot?: boolean;
    include_text?: boolean;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState> {
    const window = await this.getWindow(input.window);
    const screenshots: ComputerUseWindowState["screenshots"] = [];
    const notes = [
      "macOS window listing and screenshots are passive. Input actions switch to interactive mode and activate the target app.",
      "macOS captures the visible screen region; occluded windows and locked screens may require the user to reveal or unlock the desktop.",
    ];
    if (input.include_screenshot !== false) {
      const captureDir = join(tmpdir(), "lightcode-computer-use");
      await mkdir(captureDir, { recursive: true });
      const path = join(
        captureDir,
        `capture-${Date.now()}-${Math.random().toString(16).slice(2)}.png`,
      );
      try {
        const x = readNumber(window.x, "window.x");
        const y = readNumber(window.y, "window.y");
        const width = Math.max(1, readNumber(window.width, "window.width"));
        const height = Math.max(1, readNumber(window.height, "window.height"));
        await runProcess(
          "/usr/sbin/screencapture",
          ["-x", "-R", `${x},${y},${width},${height}`, path],
          {
            timeoutMs: 10_000,
            maxBufferBytes: 1024 * 1024,
          },
        );
        const bytes = await readFile(path);
        screenshots.push({
          id: "window",
          mimeType: "image/png",
          data: bytes.toString("base64"),
          width,
          height,
          originX: x,
          originY: y,
          zIndex: 0,
        });
      } finally {
        await rm(path, { force: true });
      }
    }
    return {
      window,
      accessibility:
        input.include_text === true
          ? {
              tree: `Window: "${window.title ?? ""}", App: ${window.app}`,
            }
          : null,
      screenshots,
      mode: "passive",
      notes,
    };
  }

  async activateWindow(input: {
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    return { ok: true, mode: "interactive" };
  }

  async click(input: {
    click_count?: number;
    mouse_button?: string;
    window: ComputerUseWindow;
    x?: number;
    y?: number;
  }): Promise<{ ok: true; mode: "interactive" }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    const x = readNumber(window.x, "window.x") + readNumber(input.x, "x");
    const y = readNumber(window.y, "window.y") + readNumber(input.y, "y");
    const count = Math.max(1, Math.trunc(input.click_count ?? 1));
    await runAppleScript(`
tell application "System Events"
  click at {${x}, ${y}}
  ${count > 1 ? `click at {${x}, ${y}}` : ""}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async typeText(input: { text: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    await runAppleScript(`
tell application "System Events"
  keystroke ${quoteAppleScript(input.text)}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async pressKey(input: { key: string; window: ComputerUseWindow }): Promise<{
    ok: true;
    mode: "interactive";
  }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    const tokens = input.key
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean);
    const modifiers = tokens
      .map(modifierForToken)
      .filter((token): token is string => Boolean(token));
    const keyToken = tokens.find((token) => !modifierForToken(token));
    if (!keyToken) throw new Error("key is required");
    const using = modifiers.length ? ` using {${modifiers.join(", ")}}` : "";
    const keyCode = keyCodeForToken(keyToken);
    await runAppleScript(`
tell application "System Events"
  ${keyCode === undefined ? `keystroke ${quoteAppleScript(keyToken)}${using}` : `key code ${keyCode}${using}`}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async scroll(input: {
    scrollX: number;
    scrollY: number;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<{ ok: true; mode: "interactive" }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    const direction = input.scrollY >= 0 ? "down" : "up";
    const steps = Math.max(1, Math.min(20, Math.round(Math.abs(input.scrollY) / 120)));
    await runAppleScript(`
tell application "System Events"
  scroll ${direction} ${steps}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async drag(input: {
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    window: ComputerUseWindow;
  }): Promise<{ ok: true; mode: "interactive" }> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    const fromX = readNumber(window.x, "window.x") + input.from_x;
    const fromY = readNumber(window.y, "window.y") + input.from_y;
    const toX = readNumber(window.x, "window.x") + input.to_x;
    const toY = readNumber(window.y, "window.y") + input.to_y;
    await runAppleScript(`
tell application "System Events"
  drag from {${fromX}, ${fromY}} to {${toX}, ${toY}}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async launchApp(input: { app: string }): Promise<{ ok: true }> {
    if (input.app.startsWith("/") || input.app.endsWith(".app")) {
      await runProcess("/usr/bin/open", [input.app], { timeoutMs: 10_000 });
    } else {
      await runProcess("/usr/bin/open", ["-a", input.app], { timeoutMs: 10_000 });
    }
    return { ok: true };
  }

  setValue(): Promise<{ ok: true; mode: "interactive" }> {
    throw new Error(
      "set_value is not supported yet; click or focus the target field, then use type_text.",
    );
  }

  performSecondaryAction(): Promise<{ ok: true; mode: "interactive" }> {
    throw new Error(
      "perform_secondary_action is not supported yet; use keyboard navigation or coordinate input.",
    );
  }
}
