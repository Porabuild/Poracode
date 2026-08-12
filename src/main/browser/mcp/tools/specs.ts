import type { ToolSpec } from "./types";

export const BROWSER_MCP_INSTRUCTIONS =
  "Use the browser MCP server for browsing, inspecting, clicking, typing, screenshots, network/console checks, and local web app verification inside Poracode. Before the first browsing action, call browser.enable once and keep it enabled across the whole uninterrupted browser session so agent presence stays consistent between calls. Always call browser.disable before pausing to ask for user input, waiting for an external event, or finishing, and enable again when you resume. Prefer browser.snapshot or browser.find before browser.click/fill/type, use @e refs from snapshots when possible, and call browser.api when you need the complete API map.";

const RAW_TOOLS: ToolSpec[] = [
  {
    name: "api",
    description:
      "Return the complete Browser MCP API, recommended workflows, and current tabs. Call this first if you need to browse, inspect, click, type, screenshot, or verify a web page.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enable",
    description:
      "Begin one uninterrupted Browser MCP session and keep its automation host and presence state active between calls.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "disable",
    description:
      "End the current Browser MCP session and release its automation presence state. Always call before pausing for user input or finishing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tabs",
    description: "List open tabs in the Poracode in-app browser panel.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "new_tab",
    description: "Open a new tab in the Poracode browser panel.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Initial URL." },
        activate: { type: "boolean", description: "Activate the new tab (default true)." },
      },
    },
  },
  {
    name: "open",
    description: "Open a URL in the active Poracode browser tab, creating a tab if needed.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: { tabId: { type: "string" }, url: { type: "string" } },
    },
  },
  {
    name: "activate_tab",
    description: "Make the given tab the active visible tab.",
    inputSchema: {
      type: "object",
      required: ["tabId"],
      properties: { tabId: { type: "string" } },
    },
  },
  {
    name: "close_tab",
    description: "Close a tab.",
    inputSchema: {
      type: "object",
      required: ["tabId"],
      properties: { tabId: { type: "string" } },
    },
  },
  {
    name: "navigate",
    description: "Navigate a tab (active tab if tabId is omitted) to a URL.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: { tabId: { type: "string" }, url: { type: "string" } },
    },
  },
  {
    name: "back",
    description: "Go back in the tab's history.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } } },
  },
  {
    name: "forward",
    description: "Go forward in the tab's history.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } } },
  },
  {
    name: "reload",
    description: "Reload the tab.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } } },
  },
  {
    name: "get_url",
    description: "Return the tab's current URL.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } } },
  },
  {
    name: "get_title",
    description: "Return the tab's current page title.",
    inputSchema: { type: "object", properties: { tabId: { type: "string" } } },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the tab (full page, viewport, or a CSS selector clip).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string", description: "If set, clip to this element." },
        fullPage: { type: "boolean", description: "Capture beyond the viewport." },
        format: {
          type: "string",
          enum: ["png", "jpeg"],
          description:
            "Preferred image format. Defaults to png; may fall back to jpeg for maxBytes.",
        },
        quality: { type: "number", description: "JPEG quality, 1-100. Default 80." },
        maxBytes: {
          type: "number",
          description: "Maximum image bytes before downscaling/returning an error.",
        },
        maxDimension: { type: "number", description: "Maximum width/height before downscaling." },
        timeoutMs: { type: "number", description: "Capture timeout. Default 800ms." },
        failOnTimeout: {
          type: "boolean",
          description: "Throw on timeout instead of returning { timedOut: true }.",
        },
      },
    },
  },
  {
    name: "query",
    description:
      "Run document.querySelectorAll and return paginated elements' text, outerHTML (truncated), and bounds.",
    inputSchema: {
      type: "object",
      required: ["selector"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "wait_for",
    description: "Poll until a selector matches at least one element, or timeoutMs elapses.",
    inputSchema: {
      type: "object",
      required: ["selector"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "click",
    description: "Click an element matching a selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "dblclick",
    description: "Double-click an element matching a selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "focus",
    description: "Focus an element matching a selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "type",
    description:
      "Focus an element and append text using browser text insertion. submit=true presses Enter at the end. Use fill to clear existing text first.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean" },
      },
    },
  },
  {
    name: "fill",
    description:
      "Clear and fill an input, textarea, or contenteditable element. submit=true presses Enter at the end.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean" },
      },
    },
  },
  {
    name: "check",
    description: "Check a checkbox or radio input matching a selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "uncheck",
    description: "Uncheck a checkbox input matching a selector or @e ref.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "select",
    description: "Select an option in a <select> by option value or visible text.",
    inputSchema: {
      type: "object",
      required: ["value"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        value: { type: "string" },
      },
    },
  },
  {
    name: "eval",
    description:
      "Evaluate a JS expression in the page's main world. Disabled by default; enable in Poracode settings.",
    inputSchema: {
      type: "object",
      required: ["js"],
      properties: { tabId: { type: "string" }, js: { type: "string" } },
    },
  },
  {
    name: "snapshot",
    description:
      "Concise structured snapshot of the page: viewport + visible interactive elements with role, accessible name, text, opaque ref, rect. Prefer this over CSS selectors when reasoning about a page.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        maxNodes: { type: "number" },
        offset: { type: "number" },
        mode: { type: "string", enum: ["full", "compact", "summary"] },
        maxTextLength: { type: "number" },
        includeHidden: { type: "boolean" },
        interactiveOnly: {
          type: "boolean",
          description: "Default true. Set false to include headings/sections/lists.",
        },
        includeUrls: { type: "boolean", description: "Include href values for links." },
        selector: { type: "string", description: "Scope the snapshot to part of the page." },
      },
    },
  },
  {
    name: "inspect",
    description:
      "Inspect the page with a structured snapshot of visible interactive elements, roles, text, refs, and bounds.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        maxNodes: { type: "number" },
        offset: { type: "number" },
        mode: { type: "string", enum: ["full", "compact", "summary"] },
        maxTextLength: { type: "number" },
        includeHidden: { type: "boolean" },
      },
    },
  },
  {
    name: "get",
    description:
      "Read fields from the first element matching `selector` (or `ref`). Pick from: text, html, value, attr (requires `attr`), count, box, styles (requires `styles[]`).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        fields: { type: "array", items: { type: "string" } },
        attr: { type: "string" },
        styles: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "is",
    description: "State checks for an element: exists / visible / enabled / checked / focused.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "find",
    description:
      "Find an element by accessibility-first criteria (role, name, label, placeholder, text, testid). Returns selector+ref and candidate count. Use `nth` to pick among multiple matches.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        role: { type: "string" },
        name: { type: "string" },
        label: { type: "string" },
        placeholder: { type: "string" },
        text: { type: "string" },
        testid: { type: "string" },
        nth: { type: "number" },
        limit: { type: "number" },
        visibleOnly: { type: "boolean" },
        interactiveOnly: { type: "boolean" },
        within: { type: "string", description: "CSS selector to scope the search." },
      },
    },
  },
  {
    name: "hover",
    description: "Move the mouse over an element (selector or ref).",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
      },
    },
  },
  {
    name: "press",
    description:
      "Press a key (Enter, Tab, Escape, ArrowDown, etc.) on the page active element, or on a selector/ref when provided. Pass shift:true for Shift+Tab traversal.",
    inputSchema: {
      type: "object",
      required: ["key"],
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        key: { type: "string" },
        shift: { type: "boolean" },
      },
    },
  },
  {
    name: "wait",
    description:
      "Wait for one condition: selector, text, url, js, or ms. Use this instead of guessing sleeps.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        url: { type: "string", description: "Substring or /regex/ URL pattern." },
        js: { type: "string", description: "JS expression; requires eval to be enabled." },
        ms: { type: "number", description: "Plain delay in milliseconds." },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "scroll",
    description:
      "Scroll the page by x/y, or scroll an element into view if `selector`/`ref` is given.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        selector: { type: "string" },
        ref: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
  },
  {
    name: "wait_for_url",
    description: "Wait until the URL matches `pattern` (substring or /regex/).",
    inputSchema: {
      type: "object",
      required: ["pattern"],
      properties: {
        tabId: { type: "string" },
        pattern: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "wait_for_text",
    description: "Wait until the literal text appears in the page's innerText.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        tabId: { type: "string" },
        text: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "wait_for_js",
    description: "Wait until `js` evaluates to truthy. Requires eval to be enabled.",
    inputSchema: {
      type: "object",
      required: ["js"],
      properties: {
        tabId: { type: "string" },
        js: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "console",
    description:
      "Return recent console/exception entries captured from the page. Optional level filter; `clear:true` resets the buffer.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        level: {
          type: "string",
          enum: ["log", "warn", "error", "info", "debug", "exception"],
        },
        clear: { type: "boolean" },
      },
    },
  },
  {
    name: "requests",
    description:
      "Recent network requests for the tab (URL, method, status, duration, size). Optional `filter` substring or /regex/. Capture is lazily enabled on first call.",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        filter: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        clear: { type: "boolean" },
      },
    },
  },
  {
    name: "cookies",
    description:
      'Cookies for the tab. `op:"get"` returns matching cookies; `op:"set"` upserts; `op:"clear"` deletes (filter optional). Requires allowDataAccess in Poracode settings.',
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        op: { type: "string", enum: ["get", "set", "clear"] },
        urls: { type: "array", items: { type: "string" } },
        cookie: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            url: { type: "string" },
            domain: { type: "string" },
            path: { type: "string" },
            secure: { type: "boolean" },
            httpOnly: { type: "boolean" },
            sameSite: { type: "string", enum: ["Strict", "Lax", "None"] },
            expires: { type: "number" },
          },
        },
        filter: {
          type: "object",
          properties: {
            name: { type: "string" },
            domain: { type: "string" },
            url: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "storage",
    description:
      'Read/write localStorage or sessionStorage. `op:"getAll"|"get"|"set"|"remove"|"clear"`. Requires allowDataAccess in Poracode settings.',
    inputSchema: {
      type: "object",
      required: ["op", "kind"],
      properties: {
        tabId: { type: "string" },
        kind: { type: "string", enum: ["local", "session"] },
        op: { type: "string", enum: ["getAll", "get", "set", "remove", "clear"] },
        key: { type: "string" },
        value: { type: "string" },
      },
    },
  },
  {
    name: "dialog",
    description:
      'Accept/dismiss/answer the next JavaScript dialog (alert/confirm/prompt). `op:"set"` arms the next dialog; `op:"wait"` arms and waits for the dialog to appear (returns its message). `op:"recent"` returns the dialog history.',
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        op: { type: "string", enum: ["set", "wait", "recent"] },
        action: { type: "string", enum: ["accept", "dismiss"] },
        promptText: { type: "string" },
        timeoutMs: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "frames",
    description:
      "List the tab's frame tree (frame id, url, parent, security origin). Use to discover iframes for further targeting.",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "string" } },
    },
  },
  {
    name: "addscript",
    description:
      'Inject a JavaScript snippet to run on every new document (Page.addScriptToEvaluateOnNewDocument). Returns an `identifier` you can later pass to `op:"remove"`. `op:"removeAll"` removes all init scripts added by this tool.',
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        op: { type: "string", enum: ["add", "remove", "removeAll"] },
        source: { type: "string" },
        identifier: { type: "string" },
      },
    },
  },
  {
    name: "addstyle",
    description:
      'Inject CSS. `op:"add"` registers a persistent style on every new document; `op:"oneshot"` injects into the current document only.',
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "string" },
        op: { type: "string", enum: ["add", "oneshot"] },
        css: { type: "string" },
      },
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  "api",
  "list_tabs",
  "get_url",
  "get_title",
  "screenshot",
  "query",
  "wait_for",
  "snapshot",
  "inspect",
  "get",
  "is",
  "find",
  "wait",
  "wait_for_url",
  "wait_for_text",
  "wait_for_js",
  "frames",
]);
const SESSION_TOOL_NAMES = new Set(["enable", "disable"]);
const DESTRUCTIVE_TOOL_NAMES = new Set([
  "close_tab",
  "click",
  "dblclick",
  "type",
  "fill",
  "check",
  "uncheck",
  "select",
  "eval",
  "press",
  "cookies",
  "storage",
  "dialog",
  "addscript",
  "addstyle",
]);

export const TOOLS: ToolSpec[] = RAW_TOOLS.map((tool) => ({
  ...tool,
  annotations: READ_ONLY_TOOL_NAMES.has(tool.name)
    ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    : SESSION_TOOL_NAMES.has(tool.name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : {
          readOnlyHint: false,
          destructiveHint: DESTRUCTIVE_TOOL_NAMES.has(tool.name),
          openWorldHint: true,
        },
}));

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

const TOOL_ALIASES = new Map([
  ["open", "navigate"],
  ["goto", "navigate"],
  ["inspect", "snapshot"],
  ["key", "press"],
  ["keyboard_type", "type"],
]);

export function normalizeToolName(name: string): string {
  return TOOL_ALIASES.get(name) ?? name;
}

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(normalizeToolName(name));
}

export function compactToolSpec(tool: ToolSpec): {
  name: string;
  description: string;
  args: string;
} {
  const schema = tool.inputSchema as {
    required?: unknown;
    properties?: unknown;
  };
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? Object.keys(schema.properties)
      : [];
  return {
    name: tool.name,
    description: tool.description,
    args: properties.length
      ? `{ ${properties.map((key) => `${key}${required.has(key) ? "" : "?"}`).join(", ")} }`
      : "{}",
  };
}
