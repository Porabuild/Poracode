import type { McpToolAnnotations } from "@/shared/contracts";
import { COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS } from "./types";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

/** All fields that may appear on a returned window object (used for inlined-window diagnostics). */
export const WINDOW_FIELD_NAMES = [
  "app",
  "id",
  "title",
  "x",
  "y",
  "width",
  "height",
  "pid",
  "displayName",
  "minimized",
  "source",
] as const;

export const WINDOW_SCHEMA = {
  type: "object",
  required: ["app", "id"],
  description: "Window object returned by list_windows or get_window_state.",
  properties: {
    app: { type: "string" },
    id: { type: "number" },
  },
};

export const MODE_SCHEMA = {
  type: "string",
  enum: ["background", "foreground"],
  default: "background",
  description: '"background" (default) or "foreground" (takeover; ask user first).',
};

const VERIFY_SCHEMA = {
  type: "string",
  enum: ["none", "fast", "effect"],
  default: "fast",
};

const OBSERVE_SCHEMA = {
  type: "string",
  enum: ["none", "text", "screenshot", "both"],
  default: "none",
  description: 'Post-action observation ("none", "text", "screenshot", or "both").',
};

const inputProperties = {
  mode: MODE_SCHEMA,
  observe: OBSERVE_SCHEMA,
  verify: VERIFY_SCHEMA,
};

export const PERFORM_STEP_SCHEMA = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "element_id", "element_action"],
      properties: {
        action: { const: "invoke_element" },
        element_id: { type: "string", minLength: 1 },
        element_action: { type: "string", enum: COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "element_id", "value"],
      properties: {
        action: { const: "set_element_value" },
        element_id: { type: "string", minLength: 1 },
        value: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "key"],
      properties: { action: { const: "press_key" }, key: { type: "string", minLength: 1 } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "text"],
      properties: { action: { const: "type_text" }, text: { type: "string" } },
    },
  ],
};

const RAW_TOOLS: ToolSpec[] = [
  {
    name: "api",
    description: "Return helper status, capabilities, permissions, and platform.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "enable",
    description: "Begin a Computer Use session and show the background-control badge.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "disable",
    description: "End the Computer Use session. Call before pausing or finishing.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "list_apps",
    description: "List apps with targetable windows, or pass query to search installed apps.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { query: { type: "string" } },
    },
  },
  {
    name: "list_windows",
    description: "List targetable windows without changing focus.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "launch_app",
    description: 'Launch an app by list_apps id, name, or path. Defaults to mode:"background".',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["app"],
      properties: { app: { type: "string" }, mode: MODE_SCHEMA, observe: OBSERVE_SCHEMA },
    },
  },
  {
    name: "get_window",
    description: "Refresh a window object after a stale-window error or move/resize.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["app", "id"],
      properties: { app: { type: "string" }, id: { type: "number" }, title: { type: "string" } },
    },
  },
  {
    name: "get_window_state",
    description:
      "Inspect a window (use include_text:true, include_screenshot:false for semantic tasks; screenshot for visuals/coordinates).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window"],
      properties: {
        window: WINDOW_SCHEMA,
        include_screenshot: { type: "boolean", default: true },
        include_text: { type: "boolean", default: false },
        max_dimension: { type: "number", minimum: 0 },
        tree_max_nodes: { type: "integer", minimum: 1, maximum: 20_000 },
        format: { type: "string", enum: ["png", "jpeg"] },
      },
    },
  },
  {
    name: "find_elements",
    description:
      "Find accessibility elements by role, name, text, or automation_id. Reuse snapshot_id to filter without rebuilding the tree.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window"],
      properties: {
        window: WINDOW_SCHEMA,
        role: { type: "string" },
        name: { type: "string" },
        text: { type: "string" },
        automation_id: { type: "string" },
        max_results: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        snapshot_id: { type: "string" },
      },
    },
  },
  {
    name: "invoke_element",
    description: "Invoke an accessibility action on element_id in the background.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "element_id", "action"],
      properties: {
        window: WINDOW_SCHEMA,
        element_id: { type: "string" },
        action: {
          type: "string",
          enum: COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS,
        },
        observe: OBSERVE_SCHEMA,
      },
    },
  },
  {
    name: "set_element_value",
    description: "Set an accessibility element's text value in the background.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "element_id", "value"],
      properties: {
        window: WINDOW_SCHEMA,
        element_id: { type: "string" },
        value: { type: "string" },
        observe: OBSERVE_SCHEMA,
      },
    },
  },
  {
    name: "activate_window",
    description:
      "Bring a window to foreground (takeover — interrupts user; ask first, never use as a workaround).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window"],
      properties: { window: WINDOW_SCHEMA, observe: OBSERVE_SCHEMA },
    },
  },
  {
    name: "perform",
    description:
      "Run 1-32 deterministic background element/value/key/text steps on one window; stops on refusal/error.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "steps"],
      properties: {
        window: WINDOW_SCHEMA,
        steps: { type: "array", minItems: 1, maxItems: 32, items: PERFORM_STEP_SCHEMA },
        observe: OBSERVE_SCHEMA,
      },
    },
  },
  {
    name: "click",
    description: "Click frame-relative coordinates (background default; follow any refused hint).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "x", "y"],
      properties: {
        window: WINDOW_SCHEMA,
        x: { type: "number" },
        y: { type: "number" },
        click_count: { type: "integer", minimum: 1, maximum: 2 },
        mouse_button: { type: "string", enum: ["left", "right", "middle", "l", "r", "m"] },
        ...inputProperties,
      },
    },
  },
  {
    name: "press_key",
    description: "Press a key or + chord in the target window (background default).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "key"],
      properties: { window: WINDOW_SCHEMA, key: { type: "string" }, ...inputProperties },
    },
  },
  {
    name: "type_text",
    description: "Type literal Unicode text into the target window (background default).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "text"],
      properties: { window: WINDOW_SCHEMA, text: { type: "string" }, ...inputProperties },
    },
  },
  {
    name: "scroll",
    description:
      'Scroll at coordinates (background default; on macOS browsers use invoke_element action "scroll").',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "x", "y", "scrollX", "scrollY"],
      properties: {
        window: WINDOW_SCHEMA,
        x: { type: "number" },
        y: { type: "number" },
        scrollX: { type: "number" },
        scrollY: { type: "number" },
        ...inputProperties,
      },
    },
  },
  {
    name: "drag",
    description: "Drag between frame-relative coordinates (background default).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["window", "from_x", "from_y", "to_x", "to_y"],
      properties: {
        window: WINDOW_SCHEMA,
        from_x: { type: "number" },
        from_y: { type: "number" },
        to_x: { type: "number" },
        to_y: { type: "number" },
        steps: { type: "integer", minimum: 1, maximum: 200 },
        ...inputProperties,
      },
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  "api",
  "list_apps",
  "list_windows",
  "get_window",
  "get_window_state",
  "find_elements",
]);
const SESSION_TOOL_NAMES = new Set(["enable", "disable"]);

export const TOOLS: ToolSpec[] = RAW_TOOLS.map((tool) => ({
  ...tool,
  annotations: READ_ONLY_TOOL_NAMES.has(tool.name)
    ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    : SESSION_TOOL_NAMES.has(tool.name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
}));
