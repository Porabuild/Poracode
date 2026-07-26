import type { ComputerUseDriver, ComputerUseScreenshot, ComputerUseWindowState } from "./types";
import { readNumber, readString, readWindow } from "../drivers/common";

export interface ToolContext {
  driver: ComputerUseDriver;
  setSessionActive?: (active: boolean) => void;
  threadId?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const WINDOW_SCHEMA = {
  type: "object",
  required: ["app", "id"],
  properties: {
    app: { type: "string" },
    id: { type: "number" },
    title: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
};

export const COMPUTER_USE_MCP_INSTRUCTIONS =
  "Use the computer_use MCP server to inspect and control native macOS or Windows apps on the host desktop (including when the user is driving from a paired phone/remote client — agents still run on that desktop). Start with computer_use.api or computer_use.list_apps, choose a returned window, then call computer_use.get_window_state before coordinate input. Immediately before the first interactive action, call computer_use.enable once; it keeps the Computer Use overlay visible across the whole uninterrupted control session. Keep it enabled between related actions, including passive inspection calls. Always call computer_use.disable before you pause to ask for user input, wait for an external event, or finish; call enable again when you resume. Prefer ordinary Win32 desktop apps when you have a choice — some Store/WinUI apps recreate window handles during activation, so always prefer the `window` object returned by interactive tools (or re-call list_windows/get_window) before the next click/type. list/get/screenshot operations are passive and do not steal focus; click, drag, scroll, type_text, press_key, activate_window, and launch_app switch to interactive mode, bring the target app to the FOREGROUND, and take exclusive control of the real mouse/keyboard — nobody should use the host machine while interactive computer-use is running. Coordinates (x/y) are window-relative with the origin at the TOP-LEFT of the window frame (including the title bar), matching the top-left pixel of the most recent get_window_state screenshot for that window; if the window may have moved or resized, call get_window_state again before sending coordinates. If a tool reports that the window is no longer available (windows are re-identified after they move/resize), call computer_use.list_windows or computer_use.get_window to obtain a fresh window id and retry. Prefer the browser MCP server for web pages. Locked desktops, secure prompts, OS permission prompts, and password/authentication surfaces require the user.";

export const TOOLS: ToolSpec[] = [
  {
    name: "api",
    description:
      "Return the complete Computer Use API and guidance. Call first when controlling a native app.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enable",
    description:
      "Begin one uninterrupted interactive Computer Use session and keep its desktop overlay visible between actions. Call once before the first interactive action.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "disable",
    description:
      "End the current Computer Use session and hide its desktop overlay. Always call before pausing for user input or finishing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_apps",
    description: "List discoverable apps and their currently targetable windows.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_windows",
    description: "List currently targetable windows.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "launch_app",
    description: "Launch an app by a list_apps id, app name, or explicit executable/app path.",
    inputSchema: {
      type: "object",
      required: ["app"],
      properties: { app: { type: "string" } },
    },
  },
  {
    name: "get_window",
    description:
      "Refresh a window object returned by list_apps, list_windows, or get_window_state. Use this to obtain a fresh window id (with current geometry) whenever a tool reports that the window is no longer available.",
    inputSchema: {
      type: "object",
      required: ["app", "id"],
      properties: { app: { type: "string" }, id: { type: "number" } },
    },
  },
  {
    name: "get_window_state",
    description:
      "Capture a point-in-time passive window screenshot and optional accessibility text. By default the screenshot is a JPEG downscaled so its largest side is at most max_dimension (1280) px to keep the payload small; if it was downscaled, the notes report the scale factor you must divide screenshot pixel coordinates by to get window-relative click coordinates. Pass format:'png' and/or a larger max_dimension for a pixel-exact capture.",
    inputSchema: {
      type: "object",
      required: ["window"],
      properties: {
        window: WINDOW_SCHEMA,
        include_screenshot: { type: "boolean" },
        include_text: { type: "boolean" },
        max_dimension: { type: "number" },
        format: { type: "string", enum: ["png", "jpeg"] },
      },
    },
  },
  {
    name: "activate_window",
    description: "Bring a returned window to the foreground. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window"],
      properties: { window: WINDOW_SCHEMA },
    },
  },
  {
    name: "click",
    description:
      "Click window-relative coordinates. x/y have their origin at the TOP-LEFT of the window frame (including the title bar), matching the top-left pixel of the get_window_state screenshot. Coordinates must come from the most recent get_window_state screenshot for this window; if the window may have moved, call get_window_state again first. If this reports the window is no longer available, call list_windows or get_window for a fresh id and retry. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window", "x", "y"],
      properties: {
        window: WINDOW_SCHEMA,
        x: { type: "number" },
        y: { type: "number" },
        click_count: { type: "integer", minimum: 1, maximum: 2 },
        mouse_button: { type: "string", enum: ["left", "right", "middle", "l", "r", "m"] },
      },
    },
  },
  {
    name: "press_key",
    description:
      "Press a key or + separated chord such as Return, Escape, Control_L+a, or KP_0. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window", "key"],
      properties: { window: WINDOW_SCHEMA, key: { type: "string" } },
    },
  },
  {
    name: "type_text",
    description:
      "Type literal text into the focused control in a returned window. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window", "text"],
      properties: { window: WINDOW_SCHEMA, text: { type: "string" } },
    },
  },
  {
    name: "scroll",
    description:
      "Scroll from window-relative coordinates. x/y have their origin at the TOP-LEFT of the window frame (including the title bar), matching the top-left pixel of the get_window_state screenshot. Coordinates must come from the most recent get_window_state screenshot for this window; if the window may have moved, call get_window_state again first. If this reports the window is no longer available, call list_windows or get_window for a fresh id and retry. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window", "x", "y", "scrollX", "scrollY"],
      properties: {
        window: WINDOW_SCHEMA,
        x: { type: "number" },
        y: { type: "number" },
        scrollX: { type: "number" },
        scrollY: { type: "number" },
      },
    },
  },
  {
    name: "drag",
    description:
      "Drag between window-relative coordinates. from_x/from_y and to_x/to_y have their origin at the TOP-LEFT of the window frame (including the title bar), matching the top-left pixel of the get_window_state screenshot. Coordinates must come from the most recent get_window_state screenshot for this window; if the window may have moved, call get_window_state again first. If this reports the window is no longer available, call list_windows or get_window for a fresh id and retry. This is interactive.",
    inputSchema: {
      type: "object",
      required: ["window", "from_x", "from_y", "to_x", "to_y"],
      properties: {
        window: WINDOW_SCHEMA,
        from_x: { type: "number" },
        from_y: { type: "number" },
        to_x: { type: "number" },
        to_y: { type: "number" },
      },
    },
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

const INTERACTIVE_TOOL_NAMES = new Set([
  "activate_window",
  "click",
  "press_key",
  "type_text",
  "scroll",
  "drag",
  "launch_app",
]);

// Lenience map: these short aliases are NOT advertised via tools/list and are
// not discoverable through MCP. They only rescue a model that guesses a common
// short name (e.g. "screenshot") before, or instead of, reading tools/list.
const TOOL_ALIASES = new Map([
  ["apps", "list_apps"],
  ["windows", "list_windows"],
  ["screenshot", "get_window_state"],
  ["key", "press_key"],
  ["type", "type_text"],
]);

export function normalizeToolName(name: string): string {
  return TOOL_ALIASES.get(name) ?? name;
}

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(normalizeToolName(name));
}

export function isInteractiveToolName(name: string): boolean {
  return INTERACTIVE_TOOL_NAMES.has(normalizeToolName(name));
}

// Tools that can synthesize arbitrary key chords (including Escape). While one
// is in flight, the desktop overlay must not intercept Escape globally.
// type_text is deliberately excluded: it types literal text and cannot emit Escape.
const KEY_CHORD_TOOL_NAMES = new Set(["press_key"]);

export function isKeyChordToolName(name: string): boolean {
  return KEY_CHORD_TOOL_NAMES.has(normalizeToolName(name));
}

function readClickCount(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const count = readNumber(value, "click_count");
  if (!Number.isInteger(count) || count < 1 || count > 2) {
    throw new Error("click_count must be 1 or 2");
  }
  return count;
}

function readMouseButton(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !["left", "right", "middle", "l", "r", "m"].includes(value)) {
    throw new Error("mouse_button must be left, right, or middle");
  }
  return value;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const tool = normalizeToolName(name);
  switch (tool) {
    case "api":
      return {
        instructions: COMPUTER_USE_MCP_INSTRUCTIONS,
        platform: process.platform,
        tools: TOOLS.map((entry) => ({
          name: `computer_use.${entry.name}`,
          description: entry.description,
        })),
      };
    case "enable":
      if (!ctx.setSessionActive) throw new Error("computer_use.enable requires a thread context");
      ctx.setSessionActive(true);
      return { enabled: true };
    case "disable":
      if (!ctx.setSessionActive) throw new Error("computer_use.disable requires a thread context");
      ctx.setSessionActive(false);
      return { enabled: false };
    case "list_apps":
      return await ctx.driver.listApps();
    case "list_windows":
      return await ctx.driver.listWindows();
    case "launch_app":
      return await ctx.driver.launchApp({ app: readString(args.app, "app") });
    case "get_window":
      return await ctx.driver.getWindow({
        ...(typeof args.app === "string" ? { app: args.app } : {}),
        id: readNumber(args.id, "id"),
      });
    case "get_window_state":
      return await ctx.driver.getWindowState({
        window: readWindow(args.window),
        ...(typeof args.include_screenshot === "boolean"
          ? { include_screenshot: args.include_screenshot }
          : {}),
        ...(typeof args.include_text === "boolean" ? { include_text: args.include_text } : {}),
        ...(typeof args.max_dimension === "number" && Number.isFinite(args.max_dimension)
          ? { max_dimension: args.max_dimension }
          : {}),
        ...(args.format === "png" || args.format === "jpeg" ? { format: args.format } : {}),
      });
    case "activate_window":
      return await ctx.driver.activateWindow({ window: readWindow(args.window) });
    case "click": {
      const clickCount = readClickCount(args.click_count);
      const mouseButton = readMouseButton(args.mouse_button);
      return await ctx.driver.click({
        window: readWindow(args.window),
        x: readNumber(args.x, "x"),
        y: readNumber(args.y, "y"),
        ...(clickCount !== undefined ? { click_count: clickCount } : {}),
        ...(mouseButton !== undefined ? { mouse_button: mouseButton } : {}),
      });
    }
    case "press_key":
      return await ctx.driver.pressKey({
        window: readWindow(args.window),
        key: readString(args.key, "key"),
      });
    case "type_text":
      return await ctx.driver.typeText({
        window: readWindow(args.window),
        text: readString(args.text, "text"),
      });
    case "scroll":
      return await ctx.driver.scroll({
        window: readWindow(args.window),
        x: readNumber(args.x, "x"),
        y: readNumber(args.y, "y"),
        scrollX: readNumber(args.scrollX, "scrollX"),
        scrollY: readNumber(args.scrollY, "scrollY"),
      });
    case "drag":
      return await ctx.driver.drag({
        window: readWindow(args.window),
        from_x: readNumber(args.from_x, "from_x"),
        from_y: readNumber(args.from_y, "from_y"),
        to_x: readNumber(args.to_x, "to_x"),
        to_y: readNumber(args.to_y, "to_y"),
      });
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export interface McpContent {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

function screenshotMetadata(
  screenshot: ComputerUseScreenshot,
): Omit<ComputerUseScreenshot, "data"> {
  const { data: _data, ...metadata } = screenshot;
  return metadata;
}

export function formatToolResult(name: string, result: unknown): McpToolResult {
  if (normalizeToolName(name) === "get_window_state" && result && typeof result === "object") {
    const state = result as ComputerUseWindowState;
    const metadata = {
      ...state,
      screenshots: state.screenshots.map(screenshotMetadata),
    };
    return {
      content: [
        { type: "text", text: JSON.stringify(metadata, null, 2) },
        ...state.screenshots.map((screenshot) => ({
          type: "image" as const,
          data: screenshot.data,
          mimeType: screenshot.mimeType,
        })),
      ],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
