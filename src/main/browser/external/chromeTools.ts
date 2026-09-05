import { performPageActions, readPerformSteps } from "../mcp/tools/perform";
import { dispatchPageTool, PAGE_TOOL_NAMES } from "../mcp/tools/page";
import { TOOLS } from "../mcp/tools/specs";
import { threadGroupColor } from "@/shared/browserMcpThread";
import type { CdpSession } from "../cdp/cdpClient";
import { captureScreenshotPng, evalJs, navigate, reload } from "../cdp/tools";
import { setCursorOverlayVisible, withCursorOverlayHidden } from "../cursorOverlay";

import type { McpContent, McpToolResult, ToolSpec } from "../mcp/tools/types";

import type { ExternalChromeConnection } from "./ExternalChromeConnection";

/**
 * Tools for driving the user's REAL Chrome via the
 * companion extension. It reuses the embedded browser's CDP tool library
 * (`../cdp/tools`) and DOM interaction primitives (`../pageDriver`) through the
 * shared {@link import("../cdp/cdpClient").CdpSession} seam — a thin
 * `executeJavaScript` adapter — so behaviour matches the embedded browser.
 */

export interface ChromeToolContext {
  connection: ExternalChromeConnection | null;
  allowEval: boolean;
  allowDataAccess: boolean;
  disabledTools?: readonly string[];
  /** Calling thread + task title (from the MCP URL) — the workspace tab joins a
   *  per-thread tab group named after the task. */
  threadId?: string;
  threadTitle?: string;
  setSessionActive?: (active: boolean) => boolean;
}

export const CHROME_MCP_INSTRUCTIONS = [
  "These tools control the USER'S OWN Chrome browser through the Poracode companion extension —",
  "real tabs, real cookies, real logged-in sessions. Treat every action as if the user performed it themselves.",
  "By default you work in a BACKGROUND 'Poracode' tab group that does NOT steal the user's foreground tab:",
  "open reuses your single background workspace tab (navigating it in place) and navigate/click/etc. run",
  "there; tabs are never auto-closed. Pass newTab:true only when you truly need a second tab. Use attach",
  "(with a tabId from list_tabs) only when the user asks you to act on a specific tab they already have open.",
  "Prefer snapshot / find to discover elements (they return @e refs) before click / fill.",
  "Use status first to confirm the extension is connected, then call chrome.enable once before the first browser action.",
  "Page commands use the same names and arguments as browser: snapshot, find, fill, type, click, press, wait, and perform. Batch known steps with perform for one final compact observation; split at decisions and navigation.",
  "Keep Chrome enabled across the whole uninterrupted session so agent presence stays consistent between calls.",
  "Always call chrome.disable before pausing to ask for user input, waiting for an external event, or finishing, and call chrome.enable again when you resume.",
  "Destructive or account-affecting actions (purchases, deletions, messages) should be confirmed with the user first.",
].join(" ");

/** Adapt a CdpSession to the `pageDriver` executor seam (pure JS injection). */
function pageExecutor(cdp: CdpSession): { executeJavaScript: (code: string) => Promise<unknown> } {
  return { executeJavaScript: (code) => evalJs(cdp, code) };
}

/** Per-thread tab-group options for the extension's `openTab`, derived from the
 *  calling thread. Absent when no thread is on the URL (falls back to Poracode). */
function threadGroupOpts(ctx: ChromeToolContext): {
  groupKey?: string;
  groupTitle?: string;
  groupColor?: string;
} {
  if (!ctx.threadId) return {};
  return {
    groupKey: ctx.threadId,
    groupColor: threadGroupColor(ctx.threadId),
    ...(ctx.threadTitle ? { groupTitle: ctx.threadTitle } : {}),
  };
}

const KEY_DEFS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
};

export function normalizeChromeToolName(name: string): string {
  return name.replace(/^chrome_/, "");
}

export async function dispatchChromeTool(
  name: string,
  payload: Record<string, unknown>,
  ctx: ChromeToolContext,
): Promise<unknown> {
  name = normalizeChromeToolName(name);
  const conn = ctx.connection;

  if (name === "status") {
    if (!conn) {
      return {
        connected: false,
        hint: "The Poracode Chrome extension is not connected. Ask the user to install/enable it — it auto-connects when Poracode is running — and confirm its popup shows Connected.",
      };
    }
    return conn.status();
  }

  if (name === "disable") {
    const shouldDetach = ctx.setSessionActive?.(false) ?? true;
    if (shouldDetach && conn?.isAttached()) {
      await setCursorOverlayVisible(conn.cdpSession(), false);
      await conn.detach();
    }
    return { enabled: false };
  }

  if (!conn) {
    return {
      error:
        "The Poracode Chrome extension is not connected. Ask the user to install/enable it (it auto-connects), then retry chrome_status.",
    };
  }

  const command = name;
  if (command === "perform")
    readPerformSteps(payload, (ctx.disabledTools ?? []).map(normalizeChromeToolName));
  const cdp = conn.cdpSession(command === "perform" ? await conn.ensureWorkspace() : undefined);
  if (command === "perform" || PAGE_TOOL_NAMES.has(command)) {
    const page = {
      cdp,
      webContents: pageExecutor(cdp),
      allowEval: ctx.allowEval,
      allowDataAccess: ctx.allowDataAccess,
      disabledTools: (ctx.disabledTools ?? []).map(normalizeChromeToolName),
      pressKey: (key: string, shift: boolean) => pressKey(cdp, key, shift),
    };
    return command === "perform"
      ? performPageActions(payload, page)
      : dispatchPageTool(command, payload, page);
  }
  switch (name) {
    case "enable":
      await conn.ensureWorkspace();
      ctx.setSessionActive?.(true);
      await setCursorOverlayVisible(cdp, true);
      return { enabled: true, status: conn.status() };
    case "list_tabs":
      return { tabs: await conn.listTabs() };
    case "open": {
      const url = typeof payload.url === "string" ? payload.url : undefined;
      const reuse = payload.newTab !== true;
      const tab = await conn.openTab(url, { reuse, ...threadGroupOpts(ctx) });
      return { opened: tab };
    }
    case "attach": {
      const tabId = typeof payload.tabId === "number" ? payload.tabId : undefined;
      const tab = await conn.attach(tabId);
      return { attached: tab };
    }
    case "navigate": {
      const url = String(payload.url ?? "");
      if (!url) throw new Error("url required");
      await navigate(cdp, url);
      return { ok: true, url };
    }
    case "reload":
      await reload(cdp);
      return { ok: true };
    case "get_url":
      return { url: await evalJs<string>(cdp, "location.href") };
    case "get_title":
      return { title: await evalJs<string>(cdp, "document.title") };
    case "screenshot": {
      const fullPage = payload.fullPage === true;
      const buffer = await withCursorOverlayHidden(cdp, () =>
        captureScreenshotPng(cdp, {
          format: "jpeg",
          quality: 60,
          scale: 0.75,
          ...(fullPage ? { fullPage: true } : {}),
        }),
      );
      return { __image: buffer.toString("base64"), mimeType: "image/jpeg" };
    }
    default:
      throw new Error(`unknown chrome tool: ${name}`);
  }
}

async function pressKey(cdp: CdpSession, key: string, shift = false): Promise<void> {
  key = key === "Esc" ? "Escape" : key === " " ? "Space" : key;
  const def = KEY_DEFS[key];
  if (def) {
    const codes = { windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
    await cdp.send("Input.dispatchKeyEvent", {
      type: def.text ? "keyDown" : "rawKeyDown",
      key: def.key,
      code: def.code,
      ...codes,
      modifiers: shift ? 8 : 0,
      ...(def.text ? { text: def.text, unmodifiedText: def.text } : {}),
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: def.key,
      code: def.code,
      ...codes,
      modifiers: shift ? 8 : 0,
    });
    return;
  }
  if (key.length === 1) {
    await cdp.send("Input.insertText", { text: key });
    return;
  }
  throw new Error(`unsupported key: ${key}`);
}

export function formatChromeToolResult(raw: unknown): McpToolResult {
  if (raw && typeof raw === "object" && "__image" in raw) {
    const image = raw as { __image: string; mimeType?: string };
    const content: McpContent[] = [
      { type: "image", data: image.__image, mimeType: image.mimeType ?? "image/png" },
    ];
    return { content };
  }
  const isError = Boolean(
    raw !== null && typeof raw === "object" && "error" in raw && (raw as { error?: unknown }).error,
  );
  const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

const RAW_CHROME_TOOLS: ToolSpec[] = [
  {
    name: "status",
    description:
      "Report whether the companion Chrome extension is connected and which of the user's tabs is attached. Call this first.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enable",
    description:
      "Begin one uninterrupted Chrome MCP session, attach the background workspace, and keep agent presence active between calls.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "disable",
    description:
      "End the current Chrome MCP session, hide agent presence, and detach when no other session is active. Always call before pausing for user input or finishing.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tabs",
    description: "List the tabs currently open in the user's real Chrome browser.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "open",
    description:
      "Open the BACKGROUND workspace in the 'Poracode' tab group (does not steal the user's foreground). Reuses your existing workspace tab by default (navigating it); tabs are never auto-closed. Pass newTab:true to open an additional tab instead.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to load in the workspace tab" },
        newTab: {
          type: "boolean",
          description: "Open a new tab instead of reusing the current workspace tab",
        },
      },
    },
  },
  {
    name: "attach",
    description:
      "Attach to one of the user's EXISTING tabs (shows a 'Poracode started debugging' banner). Use only when asked to act on a tab the user already has open; pass a tabId from list_tabs (omit for the active tab).",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "Chrome tab id from list_tabs" } },
    },
  },
  {
    name: "navigate",
    description: "Navigate the attached tab to a URL.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "reload",
    description: "Reload the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_url",
    description: "Get the current URL of the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_title",
    description: "Get the document title of the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "screenshot",
    description:
      "Capture a JPEG screenshot of the attached tab (set fullPage for the whole document).",
    inputSchema: {
      type: "object",
      properties: { fullPage: { type: "boolean" } },
    },
  },
];

const READ_ONLY_CHROME_TOOL_NAMES = new Set([
  "status",
  "list_tabs",
  "get_url",
  "get_title",
  "screenshot",
]);
const SESSION_CHROME_TOOL_NAMES = new Set(["enable", "disable"]);
const CHROME_SESSION_TOOLS: ToolSpec[] = RAW_CHROME_TOOLS.map((tool) => ({
  ...tool,
  annotations: READ_ONLY_CHROME_TOOL_NAMES.has(tool.name)
    ? { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    : SESSION_CHROME_TOOL_NAMES.has(tool.name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      : {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
}));

export const CHROME_TOOLS: ToolSpec[] = [
  ...CHROME_SESSION_TOOLS,
  ...TOOLS.filter((tool) => tool.name === "perform" || PAGE_TOOL_NAMES.has(tool.name)).map(
    (tool) => {
      const properties = { ...(tool.inputSchema.properties as Record<string, unknown>) };
      delete properties.tabId;
      return { ...tool, inputSchema: { ...tool.inputSchema, properties } };
    },
  ),
];
