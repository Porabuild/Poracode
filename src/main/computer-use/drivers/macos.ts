import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseInteractiveResult,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { readNumber, runProcess } from "./common";

// Reads the pixel dimensions encoded in a PNG's IHDR chunk (width at byte 16,
// height at byte 20, both big-endian uint32). Returns null for non-PNG or
// truncated buffers.
function readPngPixelSize(bytes: Buffer): { width: number; height: number } | null {
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

async function osascript<T>(script: string): Promise<T> {
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
async function listMacWindows(appFilter?: string): Promise<ComputerUseWindow[]> {
  const raw = await osascript<unknown>(`
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
  dispose(): void {
    // macOS spawns a fresh osascript per call, so there is nothing to release.
  }

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
    const windows = await listMacWindows(input.app);
    const window = windows.find(
      (candidate) =>
        candidate.id === input.id && (input.app === undefined || candidate.app === input.app),
    );
    if (!window) throw new Error("Window is no longer available.");
    return window;
  }

  async getWindowState(input: {
    format?: "jpeg" | "png";
    include_screenshot?: boolean;
    include_text?: boolean;
    max_dimension?: number;
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
      // Mirror the Windows driver's defaults: downscale to 1280px max and
      // encode JPEG (quality 75) so passive captures don't bill multi-MB
      // Retina PNGs as image tokens on every get_window_state.
      const maxDimension = input.max_dimension ?? 1280;
      const format = input.format ?? "jpeg";
      const token = `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const capturePath = join(captureDir, `${token}.png`);
      const encodedPath = join(captureDir, `${token}-out.${format === "jpeg" ? "jpg" : "png"}`);
      try {
        const x = readNumber(window.x, "window.x");
        const y = readNumber(window.y, "window.y");
        const width = Math.max(1, readNumber(window.width, "window.width"));
        const height = Math.max(1, readNumber(window.height, "window.height"));
        await runProcess(
          "/usr/sbin/screencapture",
          ["-x", "-R", `${x},${y},${width},${height}`, capturePath],
          {
            timeoutMs: 10_000,
            maxBufferBytes: 1024 * 1024,
          },
        );
        // window.width/height are in POINTS, but `screencapture` encodes the
        // native pixel resolution (e.g. 2x on Retina). Read the PNG's actual
        // pixel dimensions, then post-process with `sips` (ships with macOS)
        // to apply max_dimension/format before base64-encoding.
        let bytes = await readFile(capturePath);
        const pixelSize = readPngPixelSize(bytes);
        let shotWidth = pixelSize?.width ?? width;
        let shotHeight = pixelSize?.height ?? height;
        let mimeType = "image/png";
        const needsResample = maxDimension > 0 && Math.max(shotWidth, shotHeight) > maxDimension;
        const needsJpeg = format === "jpeg";
        if (needsResample || needsJpeg) {
          const sipsArgs: string[] = [];
          if (needsResample) sipsArgs.push("--resampleHeightWidthMax", String(maxDimension));
          if (needsJpeg) sipsArgs.push("-s", "format", "jpeg", "-s", "formatOptions", "75");
          sipsArgs.push(capturePath, "--out", encodedPath);
          await runProcess("/usr/bin/sips", sipsArgs, { timeoutMs: 10_000 });
          // Ask sips for the dimensions it actually encoded so the reported
          // size matches the payload exactly (its rounding may differ by 1px).
          const { stdout } = await runProcess(
            "/usr/bin/sips",
            ["-g", "pixelWidth", "-g", "pixelHeight", encodedPath],
            { timeoutMs: 10_000 },
          );
          const encodedWidth = /pixelWidth:\s*(\d+)/.exec(stdout);
          const encodedHeight = /pixelHeight:\s*(\d+)/.exec(stdout);
          if (encodedWidth) shotWidth = Number(encodedWidth[1]);
          if (encodedHeight) shotHeight = Number(encodedHeight[1]);
          bytes = await readFile(encodedPath);
          if (needsJpeg) mimeType = "image/jpeg";
        }
        // Click/scroll/drag coordinates are interpreted in POINTS. When the
        // encoded pixel size differs from the point size (Retina capture,
        // downscaling, or both), tell the model the factor to divide by.
        const scale = Math.round((shotWidth / width) * 100) / 100;
        if (scale !== 1) {
          notes.push(
            `Screenshot is ${shotWidth}x${shotHeight} pixels for a ${width}x${height}-point window (scale ${scale}x). Click/scroll/drag coordinates are in POINTS — divide screenshot pixel coordinates by ${scale} before sending them.`,
          );
        }
        screenshots.push({
          id: "window",
          mimeType,
          data: bytes.toString("base64"),
          width: shotWidth,
          height: shotHeight,
          originX: x,
          originY: y,
          zIndex: 0,
        });
      } finally {
        await rm(capturePath, { force: true });
        await rm(encodedPath, { force: true });
      }
    }
    if (input.include_text === true) {
      notes.push(
        "The accessibility tree is a placeholder (window title and app name only); detailed macOS accessibility text is not extracted yet. Do not rely on it for element targeting — use the screenshot and coordinate input.",
      );
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
  }): Promise<ComputerUseInteractiveResult> {
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
  }): Promise<ComputerUseInteractiveResult> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    const x = readNumber(window.x, "window.x") + readNumber(input.x, "x");
    const y = readNumber(window.y, "window.y") + readNumber(input.y, "y");
    const count = Math.max(1, Math.trunc(input.click_count ?? 1));
    // System Events exposes distinct `click` / `right click` verbs but has no
    // middle-button verb; throw rather than silently left-clicking.
    const button = (input.mouse_button ?? "left").trim().toLowerCase();
    let verb: "click" | "right click";
    if (button === "right" || button === "r") {
      verb = "right click";
    } else if (button === "middle" || button === "m") {
      throw new Error(
        "middle-button click is not supported on macOS via System Events; use mouse_button 'left' or 'right'.",
      );
    } else {
      verb = "click";
    }
    await runAppleScript(`
tell application "System Events"
  ${verb} at {${x}, ${y}}
  ${count > 1 ? `${verb} at {${x}, ${y}}` : ""}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async typeText(input: {
    text: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    await runAppleScript(`
tell application "System Events"
  keystroke ${quoteAppleScript(input.text)}
end tell
`);
    return { ok: true, mode: "interactive" };
  }

  async pressKey(input: {
    key: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
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
  }): Promise<ComputerUseInteractiveResult> {
    const window = await this.getWindow(input.window);
    await activateApp(window.app);
    // NOTE (needs live-mac verification): System Events has no verb to move the
    // pointer, so we cannot target the (x,y) point the way the Windows driver
    // does with SetCursorPos; the scroll lands on whatever is under the current
    // pointer / key focus in the activated app. The `scroll <direction> <n>`
    // command itself is not documented for System Events and may be unreliable
    // on some macOS versions. We now honor BOTH axes (previously scrollX was
    // dropped): vertical via up/down, horizontal via left/right.
    const commands: string[] = [];
    if (input.scrollY !== 0) {
      const vDir = input.scrollY >= 0 ? "down" : "up";
      const vSteps = Math.max(1, Math.min(20, Math.round(Math.abs(input.scrollY) / 120)));
      commands.push(`scroll ${vDir} ${vSteps}`);
    }
    if (input.scrollX !== 0) {
      const hDir = input.scrollX >= 0 ? "right" : "left";
      const hSteps = Math.max(1, Math.min(20, Math.round(Math.abs(input.scrollX) / 120)));
      commands.push(`scroll ${hDir} ${hSteps}`);
    }
    if (commands.length === 0) return { ok: true, mode: "interactive" };
    await runAppleScript(`
tell application "System Events"
  ${commands.join("\n  ")}
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
  }): Promise<ComputerUseInteractiveResult> {
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
}
