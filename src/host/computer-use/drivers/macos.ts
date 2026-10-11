import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ComputerUseApp,
  ComputerUseDriver,
  ComputerUseDriverStatus,
  ComputerUseInteractiveResult,
  ComputerUseListAppsInput,
  ComputerUseWindow,
  ComputerUseWindowState,
} from "../mcp/types";
import { legacyElementRefusal, readNumber } from "./common";
import { NativeActionLifetime } from "./nativeActionLifetime";
import { NativeProcessRunner, type NativeProcessRun } from "./nativeProcessRunner";

import {
  readPngPixelSize,
  listMacWindows,
  getMacWindow,
  activateApp,
  runAppleScript,
  keyCodeForToken,
  modifierForToken,
  quoteAppleScript,
} from "./macosCommands";

function legacyResult(window?: ComputerUseWindow): ComputerUseInteractiveResult {
  return {
    ok: true,
    mode: "interactive",
    ...(window ? { window } : {}),
    delivery: {
      delivered: "foreground",
      route: "input",
      verified: "unverified",
      notes: ["legacy_driver"],
    },
  };
}

export class MacComputerUseDriver implements ComputerUseDriver {
  private readonly actions = new NativeActionLifetime();

  constructor(private readonly processes = new NativeProcessRunner()) {}

  dispose(): void {
    this.actions.interrupt();
  }

  close(): Promise<void> {
    return this.actions.close([() => this.processes.close()]);
  }

  private withProcess<T>(operation: (run: NativeProcessRun) => Promise<T>): Promise<T> {
    return this.actions.run((signal) =>
      operation((command, args, options) =>
        this.processes.run(command, args, { ...options, signal }),
      ),
    );
  }

  describeStatus(): Promise<ComputerUseDriverStatus> {
    return this.actions.run(() => ({
      backend: "legacy",
      helper: null,
      capabilities: {
        backgroundPointer: false,
        backgroundKeyboard: false,
        backgroundChords: false,
        accessibilityTree: false,
        elementActions: false,
        occludedCapture: false,
        foregroundInput: true,
        launchApp: true,
        stableWindowIds: false,
      },
      permissions: { accessibility: "unknown", screenRecording: "unknown" },
      notes: ["Using the foreground-only legacy macOS driver."],
    }));
  }

  async listApps(input?: ComputerUseListAppsInput): Promise<ComputerUseApp[]> {
    return this.withProcess(async (runProcess) => {
      const windows = await listMacWindows(runProcess);
      const groups = new Map<string, ComputerUseWindow[]>();
      for (const window of windows) {
        const prev = groups.get(window.app) ?? [];
        prev.push(window);
        groups.set(window.app, prev);
      }
      const apps = [...groups.entries()].map(([id, appWindows]) => ({
        id,
        displayName: id,
        isRunning: true,
        windows: appWindows,
      }));
      const query = input?.query?.trim().toLowerCase();
      if (!query) return apps;
      return apps.filter(
        (app) =>
          app.id.toLowerCase().includes(query) ||
          app.windows.some((window) => window.title?.toLowerCase().includes(query)),
      );
    });
  }

  listWindows(): Promise<ComputerUseWindow[]> {
    return this.withProcess(async (runProcess) => {
      return listMacWindows(runProcess);
    });
  }

  async getWindow(input: { app?: string; id: number }): Promise<ComputerUseWindow> {
    return this.withProcess(async (runProcess) => {
      return await getMacWindow(runProcess, input);
    });
  }

  async getWindowState(input: {
    format?: "jpeg" | "png";
    include_screenshot?: boolean;
    include_text?: boolean;
    max_dimension?: number;
    window: ComputerUseWindow;
  }): Promise<ComputerUseWindowState> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      const screenshots: ComputerUseWindowState["screenshots"] = [];
      const notes = [
        "macOS window listing and screenshots are passive. Input actions switch to interactive mode and activate the target app.",
        "macOS captures the visible screen region; occluded windows and locked screens may require the user to reveal or unlock the desktop.",
      ];
      if (input.include_screenshot !== false) {
        const captureDir = join(tmpdir(), "poracode-computer-use");
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
    });
  }

  async activateWindow(input: {
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
      return legacyResult(window);
    });
  }

  async click(input: {
    click_count?: number;
    mouse_button?: string;
    window: ComputerUseWindow;
    x?: number;
    y?: number;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
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
      await runAppleScript(
        runProcess,
        `
tell application "System Events"
  ${verb} at {${x}, ${y}}
  ${count > 1 ? `${verb} at {${x}, ${y}}` : ""}
end tell
`,
      );
      return legacyResult(window);
    });
  }

  async typeText(input: {
    text: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
      await runAppleScript(
        runProcess,
        `
tell application "System Events"
  keystroke ${quoteAppleScript(input.text)}
end tell
`,
      );
      return legacyResult(window);
    });
  }

  async pressKey(input: {
    key: string;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
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
      await runAppleScript(
        runProcess,
        `
tell application "System Events"
  ${keyCode === undefined ? `keystroke ${quoteAppleScript(keyToken)}${using}` : `key code ${keyCode}${using}`}
end tell
`,
      );
      return legacyResult(window);
    });
  }

  async scroll(input: {
    scrollX: number;
    scrollY: number;
    window: ComputerUseWindow;
    x: number;
    y: number;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
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
      if (commands.length === 0) return legacyResult(window);
      await runAppleScript(
        runProcess,
        `
tell application "System Events"
  ${commands.join("\n  ")}
end tell
`,
      );
      return legacyResult(window);
    });
  }

  async drag(input: {
    from_x: number;
    from_y: number;
    to_x: number;
    to_y: number;
    window: ComputerUseWindow;
  }): Promise<ComputerUseInteractiveResult> {
    return this.withProcess(async (runProcess) => {
      const window = await getMacWindow(runProcess, input.window);
      await activateApp(runProcess, window.app);
      const fromX = readNumber(window.x, "window.x") + input.from_x;
      const fromY = readNumber(window.y, "window.y") + input.from_y;
      const toX = readNumber(window.x, "window.x") + input.to_x;
      const toY = readNumber(window.y, "window.y") + input.to_y;
      await runAppleScript(
        runProcess,
        `
tell application "System Events"
  drag from {${fromX}, ${fromY}} to {${toX}, ${toY}}
end tell
`,
      );
      return legacyResult(window);
    });
  }

  findElements(input: Parameters<ComputerUseDriver["findElements"]>[0]) {
    return this.actions.run(() => legacyElementRefusal(input.window));
  }

  invokeElement(input: Parameters<ComputerUseDriver["invokeElement"]>[0]) {
    return this.actions.run(() => legacyElementRefusal(input.window));
  }

  setElementValue(input: Parameters<ComputerUseDriver["setElementValue"]>[0]) {
    return this.actions.run(() => legacyElementRefusal(input.window));
  }

  async launchApp(
    input: Parameters<ComputerUseDriver["launchApp"]>[0],
  ): ReturnType<ComputerUseDriver["launchApp"]> {
    return this.withProcess(async (runProcess) => {
      // `-g` is what keeps a background launch from taking the user's focus.
      const background = input.mode !== "foreground";
      const args = background ? ["-g"] : [];
      if (input.app.startsWith("/") || input.app.endsWith(".app")) {
        args.push(input.app);
      } else {
        args.push("-a", input.app);
      }
      await runProcess("/usr/bin/open", args, { timeoutMs: 10_000 });
      return {
        ok: true,
        delivery: {
          delivered: background ? "background" : "foreground",
          route: "launch",
          verified: "unverified",
        },
      };
    });
  }
}
