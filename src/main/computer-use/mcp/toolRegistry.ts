import type {
  ComputerUseObservation,
  ComputerUseScreenshot,
  ComputerUseWindowState,
} from "./types";
import { WINDOW_SHAPE_ERROR } from "../drivers/common";
import { dispatchTool as dispatchNormalizedTool } from "./dispatch";
import { compactStateNotes, omitLaneMode } from "./resultTrim";
import { TOOLS, WINDOW_SCHEMA } from "./toolSpecs";

export { COMPUTER_USE_MCP_INSTRUCTIONS } from "./instructions";
export { TOOLS, type ToolSpec } from "./toolSpecs";
export type { ToolContext } from "./dispatch";

export const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

// Driving the desktop is exactly what `destructiveHint` marks in the tool
// specs, so the activity overlay derives its set from there rather than keeping
// a second list that a new tool could silently miss.
const INTERACTIVE_TOOL_NAMES = new Set(
  TOOLS.filter((tool) => tool.annotations?.destructiveHint).map((tool) => tool.name),
);

// `launch_app` is not here: it takes a `mode` like the input tools and
// defaults to a background launch that never raises the app.
const FOREGROUND_ONLY_TOOL_NAMES = new Set(["activate_window"]);

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

export function resolveActivityDelivery(
  name: string,
  args: Record<string, unknown>,
): "background" | "foreground" {
  if (isForegroundOnlyToolName(name)) return "foreground";
  if (args.mode === "foreground") return "foreground";
  return "background";
}

const KEY_CHORD_TOOL_NAMES = new Set(["press_key"]);

export function isKeyChordToolName(name: string): boolean {
  return KEY_CHORD_TOOL_NAMES.has(normalizeToolName(name));
}

/**
 * The single owner of argument synonyms: names agents actually send for fields
 * the published schema spells differently. Rewritten onto the canonical key
 * before unknown-argument rejection, so a guessed synonym is the action that
 * was asked for and a real typo is still named. The helper's wire structs take
 * the canonical names only — no serde aliases; a second table on the Rust side
 * drifted the moment `drag` grew aliases the wire never mirrored.
 *
 * `button` is the dangerous one: a blind evaluation sent it on a right click,
 * the helper dropped the field, and a default left press fired the control's
 * primary action — a Delete button when a menu was requested.
 */
export const ARG_ALIASES: Record<string, Record<string, string>> = {
  click: {
    button: "mouse_button",
    mouseButton: "mouse_button",
    count: "click_count",
    clickCount: "click_count",
  },
  invoke_element: {
    elementId: "element_id",
    element_action: "action",
  },
  set_element_value: {
    elementId: "element_id",
  },
  find_elements: {
    snapshotId: "snapshot_id",
    maxResults: "max_results",
    automationId: "automation_id",
  },
  get_window_state: {
    includeScreenshot: "include_screenshot",
    includeText: "include_text",
    maxDimension: "max_dimension",
    treeMaxNodes: "tree_max_nodes",
  },
  scroll: {
    scroll_x: "scrollX",
    scroll_y: "scrollY",
  },
  drag: {
    fromX: "from_x",
    fromY: "from_y",
    toX: "to_x",
    toY: "to_y",
  },
};

function rewriteArgumentAliases(name: string, args: Record<string, unknown>): void {
  const aliases = ARG_ALIASES[name];
  if (!aliases) return;
  for (const [from, to] of Object.entries(aliases)) {
    if (!Object.hasOwn(args, from)) continue;
    if (Object.hasOwn(args, to) && args[from] !== args[to]) {
      throw new Error(`${name} takes ${to}, not both ${to} and ${from}.`);
    }
    if (!Object.hasOwn(args, to)) args[to] = args[from];
    delete args[from];
  }
}

/**
 * Reject arguments a tool does not take, naming the ones it does.
 *
 * Silently ignoring them is worse than it sounds: a blind evaluation watched an
 * agent try `direction`, `amount`, `delta_y` and `dy` on the same call, each
 * accepted without complaint, and conclude from the lack of any error that it
 * simply had not guessed the right parameter name yet — while the action it
 * wanted was never going to happen. An unknown argument is a misunderstanding,
 * and saying so immediately costs one call instead of five.
 */
function rejectUnknownArguments(name: string, args: Record<string, unknown>): void {
  const properties = TOOLS.find((tool) => tool.name === name)?.inputSchema.properties;
  if (!properties || typeof properties !== "object") return;
  const accepted = Object.keys(properties as Record<string, unknown>);
  const unknown = Object.keys(args).filter(
    // An underscore prefix is the MCP convention for metadata. It belongs on
    // the request rather than inside a tool's arguments, but a client that
    // inlines it should not have its call rejected over a naming rule.
    (key) => !key.startsWith("_") && !accepted.includes(key),
  );
  if (unknown.length === 0) return;
  const windowFields = Object.keys(WINDOW_SCHEMA.properties);
  const inlinedWindow =
    accepted.includes("window") && unknown.every((key) => windowFields.includes(key));
  throw new Error(
    `${name} does not take ${unknown.join(", ")}. It accepts: ${accepted.sort().join(", ")}.${
      inlinedWindow ? ` ${WINDOW_SHAPE_ERROR}` : ""
    }`,
  );
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: import("./dispatch").ToolContext,
): Promise<unknown> {
  const normalized = normalizeToolName(name);
  rewriteArgumentAliases(normalized, args);
  rejectUnknownArguments(normalized, args);
  return await dispatchNormalizedTool(normalized, args, ctx);
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
  const directState =
    normalizeToolName(name) === "get_window_state" && result && typeof result === "object"
      ? (result as ComputerUseWindowState)
      : undefined;
  const observation = (result as { observation?: ComputerUseObservation } | undefined)?.observation;
  const observedState = observation?.ok ? observation.state : undefined;
  const state = directState ?? observedState;
  if (state) {
    // Screenshot payloads move to image content, and capture prose is reduced
    // to the coordinate rule the agent actually needs.
    const compactNotes = compactStateNotes(state.notes);
    const compactState = {
      ...omitLaneMode(state),
      screenshots: state.screenshots.map(screenshotMetadata),
      ...(compactNotes ? { notes: compactNotes } : {}),
    };
    const metadata = directState
      ? compactState
      : {
          ...(result as Record<string, unknown>),
          observation: { ok: true, state: compactState },
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
