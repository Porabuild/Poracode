import type { McpToolAnnotations } from "@/shared/contracts";
import { COMPUTER_USE_INVOKABLE_ELEMENT_ACTIONS } from "./types";

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export const WINDOW_SCHEMA = {
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
    pid: { type: "number" },
    displayName: { type: "string" },
    minimized: { type: "boolean" },
    source: { type: "string", enum: ["win32", "cg", "x11", "atspi"] },
  },
};

export const MODE_SCHEMA = {
  type: "string",
  enum: ["background", "foreground"],
  default: "background",
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
  description:
    "Return observation.state to avoid a separate inspection call. Prefer text for semantic checks; screenshot or both for visual checks.",
};

const inputProperties = {
  mode: MODE_SCHEMA,
  observe: OBSERVE_SCHEMA,
  verify: VERIFY_SCHEMA,
};

const PERFORM_STEP_SCHEMA = {
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
    description:
      "Return native-helper status, capabilities, permissions, and platform notes. Call only when capability or permission details are needed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enable",
    description:
      "Begin one uninterrupted Computer Use session. Keeps a background-control badge visible between related actions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "disable",
    description:
      "End the current Computer Use session and hide its badge or takeover overlay. Always call before pausing or finishing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_apps",
    description:
      "List apps that currently have targetable windows. Pass query to also search installed apps by name and receive a launchable id.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
  },
  {
    name: "list_windows",
    description: "List currently targetable windows without changing focus.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "launch_app",
    description:
      "Launch an app by a list_apps id, known app name, or explicit app path. Launching is a foreground operation.",
    inputSchema: {
      type: "object",
      required: ["app"],
      properties: { app: { type: "string" }, observe: OBSERVE_SCHEMA },
    },
  },
  {
    name: "get_window",
    description:
      "Refresh a returned window object. Use this after a stale-window error or when the window may have moved or resized.",
    inputSchema: {
      type: "object",
      required: ["app", "id"],
      properties: { app: { type: "string" }, id: { type: "number" } },
    },
  },
  {
    name: "get_window_state",
    description:
      "Passively inspect a window. For semantic tasks, use include_text:true with include_screenshot:false; request a screenshot for visual checks or coordinates. The response reports capture method and scale for coordinate conversion.",
    inputSchema: {
      type: "object",
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
      "Find accessibility elements by role, name, text, or automation id without changing focus. Pass get_window_state's accessibility.snapshotId or a previous find_elements result's snapshotId as snapshot_id to filter that tree without rebuilding it.",
    inputSchema: {
      type: "object",
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
    description:
      "Perform a supported accessibility action on an element id from the latest tree or find_elements result. Runs in the background.",
    inputSchema: {
      type: "object",
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
    description:
      "Set an accessibility element's value without focusing or activating the target window.",
    inputSchema: {
      type: "object",
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
      "Explicitly bring a returned window to the foreground. This takes focus and shows the takeover border.",
    inputSchema: {
      type: "object",
      required: ["window"],
      properties: { window: WINDOW_SCHEMA, observe: OBSERVE_SCHEMA },
    },
  },
  {
    name: "perform",
    description:
      "Run 1 to 32 deterministic background element, value, key, or text actions against one window. Stops on refusal, error, or unexpected foreground delivery and can return one final observation.",
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
    description:
      "Click frame-relative coordinates in the background by default. Read delivery/refused; only retry in foreground when the refusal recommends it.",
    inputSchema: {
      type: "object",
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
    description:
      "Press a key or + separated chord in the target window in the background by default.",
    inputSchema: {
      type: "object",
      required: ["window", "key"],
      properties: { window: WINDOW_SCHEMA, key: { type: "string" }, ...inputProperties },
    },
  },
  {
    name: "type_text",
    description: "Type literal Unicode text into the target window in the background by default.",
    inputSchema: {
      type: "object",
      required: ["window", "text"],
      properties: { window: WINDOW_SCHEMA, text: { type: "string" }, ...inputProperties },
    },
  },
  {
    name: "scroll",
    description:
      "Scroll at frame-relative coordinates in the background by default. Read delivery/refused before continuing.",
    inputSchema: {
      type: "object",
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
    description:
      "Drag between frame-relative coordinates in the background by default. Optional steps controls interpolation.",
    inputSchema: {
      type: "object",
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
