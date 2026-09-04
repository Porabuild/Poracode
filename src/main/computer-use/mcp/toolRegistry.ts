import type { ComputerUseScreenshot, ComputerUseWindowState } from "./types";
import { dispatchTool as dispatchNormalizedTool } from "./dispatch";
import { TOOLS } from "./toolSpecs";

export { COMPUTER_USE_MCP_INSTRUCTIONS } from "./instructions";
export { TOOLS, type ToolSpec } from "./toolSpecs";
export type { ToolContext } from "./dispatch";

export const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

const INTERACTIVE_TOOL_NAMES = new Set([
  "activate_window",
  "click",
  "press_key",
  "type_text",
  "scroll",
  "drag",
  "launch_app",
  "invoke_element",
  "set_element_value",
]);

const FOREGROUND_ONLY_TOOL_NAMES = new Set(["activate_window", "launch_app"]);

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

export function isForegroundOnlyToolName(name: string): boolean {
  return FOREGROUND_ONLY_TOOL_NAMES.has(normalizeToolName(name));
}

const PORTAL_FOREGROUND_TOOL_NAMES = new Set(["click", "press_key", "type_text", "scroll", "drag"]);

export function resolveActivityDelivery(
  name: string,
  args: Record<string, unknown>,
): "background" | "foreground" {
  if (isForegroundOnlyToolName(name)) return "foreground";
  if (args.mode === "foreground") return "foreground";
  if (!PORTAL_FOREGROUND_TOOL_NAMES.has(normalizeToolName(name))) return "background";
  const window =
    args.window && typeof args.window === "object"
      ? (args.window as Record<string, unknown>)
      : undefined;
  return window?.source === "atspi" || (typeof window?.id === "number" && window.id < 0)
    ? "foreground"
    : "background";
}

const KEY_CHORD_TOOL_NAMES = new Set(["press_key"]);

export function isKeyChordToolName(name: string): boolean {
  return KEY_CHORD_TOOL_NAMES.has(normalizeToolName(name));
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: import("./dispatch").ToolContext,
): Promise<unknown> {
  return await dispatchNormalizedTool(normalizeToolName(name), args, ctx);
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

export interface FormatToolResultOptions {
  notes?: readonly string[];
}

function screenshotMetadata(
  screenshot: ComputerUseScreenshot,
): Omit<ComputerUseScreenshot, "data"> {
  const { data: _data, ...metadata } = screenshot;
  return metadata;
}

function formatText(text: string, notes: readonly string[]): string {
  if (notes.length === 0) return text;
  return `${text}\n\nComputer Use backend notes:\n${notes.map((note) => `- ${note}`).join("\n")}`;
}

export function formatToolResult(
  name: string,
  result: unknown,
  options: FormatToolResultOptions = {},
): McpToolResult {
  const notes = options.notes ?? [];
  if (normalizeToolName(name) === "get_window_state" && result && typeof result === "object") {
    const state = result as ComputerUseWindowState;
    const metadata = {
      ...state,
      screenshots: state.screenshots.map(screenshotMetadata),
    };
    return {
      content: [
        { type: "text", text: formatText(JSON.stringify(metadata), notes) },
        ...state.screenshots.map((screenshot) => ({
          type: "image" as const,
          data: screenshot.data,
          mimeType: screenshot.mimeType,
        })),
      ],
    };
  }
  return {
    content: [{ type: "text", text: formatText(JSON.stringify(result), notes) }],
  };
}
