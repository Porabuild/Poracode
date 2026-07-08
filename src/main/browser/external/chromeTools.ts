import { threadGroupColor } from "@/shared/browserMcpThread";
import type { CdpSession } from "../cdp/cdpClient";
import {
  captureScreenshotPng,
  evalJs,
  findByA11y,
  getCookies,
  getElementInfo,
  getElementState,
  navigate,
  pageSnapshot,
  reload,
  waitForSelector,
  waitForText,
} from "../cdp/tools";
import { glideCursorToSelector } from "../cursorOverlay";
import { clampInteger } from "../mcp/tools/helpers";
import type { McpContent, McpToolResult, ToolSpec } from "../mcp/tools/types";
import { clickSelector, fillSelector, resolveRefToSelector, typeIntoSelector } from "../pageDriver";
import type { ExternalChromeConnection } from "./ExternalChromeConnection";

/**
 * A deliberately small tool set for driving the user's REAL Chrome via the
 * companion extension. It reuses the embedded browser's CDP tool library
 * (`../cdp/tools`) and DOM interaction primitives (`../pageDriver`) through the
 * shared {@link import("../cdp/cdpClient").CdpSession} seam — a thin
 * `executeJavaScript` adapter — so behaviour matches the embedded browser.
 */

export interface ChromeToolContext {
  connection: ExternalChromeConnection | null;
  allowEval: boolean;
  allowDataAccess: boolean;
  /** Calling thread + task title (from the MCP URL) — the workspace tab joins a
   *  per-thread tab group named after the task. */
  threadId?: string;
  threadTitle?: string;
}

export const CHROME_MCP_INSTRUCTIONS = [
  "These tools control the USER'S OWN Chrome browser through the Poracode companion extension —",
  "real tabs, real cookies, real logged-in sessions. Treat every action as if the user performed it themselves.",
  "By default you work in a BACKGROUND 'Poracode' tab group that does NOT steal the user's foreground tab:",
  "chrome_open reuses your single background workspace tab (navigating it in place) and navigate/click/etc. run",
  "there; tabs are never auto-closed. Pass newTab:true only when you truly need a second tab. Use chrome_attach",
  "(with a tabId from chrome_list_tabs) only when the user asks you to act on a specific tab they already have open.",
  "Prefer chrome_snapshot / chrome_find to discover elements (they return @e refs) before chrome_click / chrome_fill.",
  "Use chrome_status first to confirm the extension is connected and which tab is attached.",
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

/** Resolve a tool's `selector` or snapshot `@e ref` to a CSS selector (or null). */
async function resolveSelector(
  cdp: CdpSession,
  payload: { selector?: unknown; ref?: unknown },
): Promise<string | null> {
  if (typeof payload.selector === "string" && payload.selector.length > 0) {
    return payload.selector;
  }
  if (typeof payload.ref === "string" && payload.ref.length > 0) {
    return await resolveRefToSelector(pageExecutor(cdp), payload.ref);
  }
  return null;
}

const KEY_DEFS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
};

export async function dispatchChromeTool(
  name: string,
  payload: Record<string, unknown>,
  ctx: ChromeToolContext,
): Promise<unknown> {
  const conn = ctx.connection;

  if (name === "chrome_status") {
    if (!conn) {
      return {
        connected: false,
        hint: "The Poracode Chrome extension is not connected. Ask the user to install/enable it — it auto-connects when Poracode is running — and confirm its popup shows Connected.",
      };
    }
    return conn.status();
  }

  if (!conn) {
    return {
      error:
        "The Poracode Chrome extension is not connected. Ask the user to install/enable it (it auto-connects), then retry chrome_status.",
    };
  }

  const cdp = conn.cdpSession();

  switch (name) {
    case "chrome_list_tabs":
      return { tabs: await conn.listTabs() };
    case "chrome_open": {
      const url = typeof payload.url === "string" ? payload.url : undefined;
      const reuse = payload.newTab !== true;
      const tab = await conn.openTab(url, { reuse, ...threadGroupOpts(ctx) });
      return { opened: tab };
    }
    case "chrome_attach": {
      const tabId = typeof payload.tabId === "number" ? payload.tabId : undefined;
      const tab = await conn.attach(tabId);
      return { attached: tab };
    }
    case "chrome_navigate": {
      const url = String(payload.url ?? "");
      if (!url) throw new Error("url required");
      await navigate(cdp, url);
      return { ok: true, url };
    }
    case "chrome_reload":
      await reload(cdp);
      return { ok: true };
    case "chrome_get_url":
      return { url: await evalJs<string>(cdp, "location.href") };
    case "chrome_get_title":
      return { title: await evalJs<string>(cdp, "document.title") };
    case "chrome_snapshot": {
      const maxNodes = clampInteger(payload.maxNodes, 120, 1, 500);
      const mode: "full" | "compact" | "summary" =
        payload.mode === "compact" ? "compact" : payload.mode === "summary" ? "summary" : "full";
      return await pageSnapshot(cdp, {
        maxNodes,
        mode,
        ...(payload.interactiveOnly === false ? { interactiveOnly: false } : {}),
        ...(payload.includeUrls === true ? { includeUrls: true } : {}),
        ...(typeof payload.selector === "string" ? { selector: payload.selector } : {}),
      });
    }
    case "chrome_find":
      return await findByA11y(cdp, {
        ...(typeof payload.role === "string" ? { role: payload.role } : {}),
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.text === "string" ? { text: payload.text } : {}),
        ...(typeof payload.placeholder === "string" ? { placeholder: payload.placeholder } : {}),
        ...(typeof payload.nth === "number" ? { nth: payload.nth } : {}),
        ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}),
      });
    case "chrome_get": {
      const selector = String(payload.selector ?? "");
      if (!selector) throw new Error("selector required");
      const fieldsRaw = Array.isArray(payload.fields) ? (payload.fields as string[]) : ["text"];
      const fields = fieldsRaw.filter(
        (f): f is "text" | "html" | "value" | "attr" | "count" | "box" =>
          ["text", "html", "value", "attr", "count", "box"].includes(f),
      );
      return await getElementInfo(
        cdp,
        selector,
        fields,
        typeof payload.attr === "string" ? payload.attr : undefined,
      );
    }
    case "chrome_is": {
      const selector = String(payload.selector ?? "");
      if (!selector) throw new Error("selector required");
      return await getElementState(cdp, selector);
    }
    case "chrome_click": {
      const selector = await resolveSelector(cdp, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(cdp, selector);
      await clickSelector(pageExecutor(cdp), selector);
      return { ok: true };
    }
    case "chrome_fill": {
      const selector = await resolveSelector(cdp, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(cdp, selector);
      await fillSelector(
        pageExecutor(cdp),
        selector,
        String(payload.text ?? ""),
        payload.submit === true,
      );
      return { ok: true };
    }
    case "chrome_type": {
      const selector = await resolveSelector(cdp, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(cdp, selector);
      await typeIntoSelector(
        pageExecutor(cdp),
        selector,
        String(payload.text ?? ""),
        payload.submit === true,
      );
      return { ok: true };
    }
    case "chrome_press": {
      const key = String(payload.key ?? "");
      if (!key) throw new Error("key required");
      await pressKey(conn, key);
      return { ok: true };
    }
    case "chrome_wait": {
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (typeof payload.ms === "number") {
        await delay(Math.max(0, Math.min(60_000, payload.ms)));
        return { ok: true };
      }
      if (typeof payload.selector === "string" && payload.selector) {
        return { found: await waitForSelector(cdp, payload.selector, timeoutMs) };
      }
      if (typeof payload.text === "string" && payload.text) {
        await waitForText(cdp, payload.text, timeoutMs);
        return { ok: true };
      }
      throw new Error("chrome_wait requires selector, text, or ms");
    }
    case "chrome_screenshot": {
      const fullPage = payload.fullPage === true;
      const buffer = await captureScreenshotPng(cdp, {
        format: "jpeg",
        quality: 60,
        scale: 0.75,
        ...(fullPage ? { fullPage: true } : {}),
      });
      return { __image: buffer.toString("base64"), mimeType: "image/jpeg" };
    }
    case "chrome_eval": {
      if (!ctx.allowEval) {
        return { error: "chrome_eval is disabled. Enable it in Lightcode browser settings." };
      }
      const expression = String(payload.js ?? "");
      if (!expression) throw new Error("js required");
      try {
        return { result: await evalJs(cdp, expression) };
      } catch (err) {
        return { error: (err as Error).message ?? "eval failed" };
      }
    }
    case "chrome_cookies": {
      if (!ctx.allowDataAccess) {
        return {
          error:
            "chrome_cookies is disabled. Enable 'Allow agents to read/write cookies and storage' in Lightcode settings.",
        };
      }
      const urls = Array.isArray(payload.urls) ? (payload.urls as string[]) : undefined;
      return { cookies: await getCookies(cdp, urls) };
    }
    default:
      throw new Error(`unknown chrome tool: ${name}`);
  }
}

async function pressKey(conn: ExternalChromeConnection, key: string): Promise<void> {
  const def = KEY_DEFS[key];
  if (def) {
    const codes = { windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
    await conn.sendCdp("Input.dispatchKeyEvent", {
      type: def.text ? "keyDown" : "rawKeyDown",
      key: def.key,
      code: def.code,
      ...codes,
      ...(def.text ? { text: def.text, unmodifiedText: def.text } : {}),
    });
    await conn.sendCdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: def.key,
      code: def.code,
      ...codes,
    });
    return;
  }
  if (key.length === 1) {
    await conn.sendCdp("Input.insertText", { text: key });
    return;
  }
  throw new Error(`unsupported key: ${key}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export const CHROME_TOOLS: ToolSpec[] = [
  {
    name: "chrome_status",
    description:
      "Report whether the companion Chrome extension is connected and which of the user's tabs is attached. Call this first.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chrome_list_tabs",
    description: "List the tabs currently open in the user's real Chrome browser.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chrome_open",
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
    name: "chrome_attach",
    description:
      "Attach to one of the user's EXISTING tabs (shows a 'Poracode started debugging' banner). Use only when asked to act on a tab the user already has open; pass a tabId from chrome_list_tabs (omit for the active tab).",
    inputSchema: {
      type: "object",
      properties: { tabId: { type: "number", description: "Chrome tab id from chrome_list_tabs" } },
    },
  },
  {
    name: "chrome_navigate",
    description: "Navigate the attached tab to a URL.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "chrome_reload",
    description: "Reload the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chrome_get_url",
    description: "Get the current URL of the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chrome_get_title",
    description: "Get the document title of the attached tab.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "chrome_snapshot",
    description:
      "Structured accessibility snapshot of the attached page. Returns @e refs to pass to chrome_click/fill.",
    inputSchema: {
      type: "object",
      properties: {
        maxNodes: { type: "number" },
        mode: { type: "string", enum: ["full", "compact", "summary"] },
        selector: { type: "string" },
        interactiveOnly: { type: "boolean" },
        includeUrls: { type: "boolean" },
      },
    },
  },
  {
    name: "chrome_find",
    description: "Find an element by role/name/text/placeholder. Returns @e refs and a best match.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string" },
        name: { type: "string" },
        text: { type: "string" },
        placeholder: { type: "string" },
        nth: { type: "number" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "chrome_get",
    description: "Read fields (text/html/value/attr/count/box) from an element by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        fields: { type: "array", items: { type: "string" } },
        attr: { type: "string" },
      },
      required: ["selector"],
    },
  },
  {
    name: "chrome_is",
    description: "Element state (exists/visible/enabled/checked/focused) by CSS selector.",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
    },
  },
  {
    name: "chrome_click",
    description: "Click an element by @e ref or CSS selector.",
    inputSchema: {
      type: "object",
      properties: { ref: { type: "string" }, selector: { type: "string" } },
    },
  },
  {
    name: "chrome_fill",
    description:
      "Replace an input/textarea value (or contenteditable text). Set submit to press enter after.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
        submit: { type: "boolean" },
      },
      required: ["text"],
    },
  },
  {
    name: "chrome_type",
    description: "Append text to an input/textarea (does not clear existing value).",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        selector: { type: "string" },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "chrome_press",
    description:
      "Press a key on the attached page (Enter, Tab, Escape, Backspace, Arrow*, or a single character).",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "chrome_wait",
    description: "Wait for a selector to appear, text to appear, or a fixed number of ms.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
        ms: { type: "number" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "chrome_screenshot",
    description:
      "Capture a JPEG screenshot of the attached tab (set fullPage for the whole document).",
    inputSchema: {
      type: "object",
      properties: { fullPage: { type: "boolean" } },
    },
  },
  {
    name: "chrome_eval",
    description: "Evaluate JavaScript in the attached page (requires eval enabled in settings).",
    inputSchema: {
      type: "object",
      properties: { js: { type: "string" } },
      required: ["js"],
    },
  },
  {
    name: "chrome_cookies",
    description: "Read cookies from the attached page (requires data access enabled in settings).",
    inputSchema: {
      type: "object",
      properties: { urls: { type: "array", items: { type: "string" } } },
    },
  },
];

export const CHROME_TOOL_NAMES = new Set(CHROME_TOOLS.map((t) => t.name));
