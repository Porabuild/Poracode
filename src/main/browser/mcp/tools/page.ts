import {
  back,
  clearCookies,
  evalJs,
  findByA11y,
  forward,
  getCookies,
  getElementInfo,
  getElementState,
  getFrameTree,
  pageSnapshot,
  querySelectorAllSnapshot,
  setCookie,
  storageClear,
  storageGet,
  storageGetAll,
  storageRemove,
  storageSet,
  waitForJs,
  waitForSelector,
  waitForText,
  waitForUrl,
} from "../../cdp/tools";
import {
  clickSelector,
  doubleClickSelector,
  fillSelector,
  focusSelector,
  hoverSelector,
  pressKey,
  scrollPage,
  selectOption,
  setCheckedSelector,
  typeIntoSelector,
} from "../../pageDriver";
import { glideCursorToSelector } from "../../cursorOverlay";
import { clampInteger, resolveSelectorArg } from "./helpers";

import type { CdpSession } from "../../cdp/cdpClient";
import type { WebContents } from "electron";

export interface PageToolContext {
  cdp: CdpSession;
  webContents: Pick<WebContents, "executeJavaScript">;
  allowEval: boolean;
  allowDataAccess: boolean;
  disabledTools?: readonly string[];
  /** Batches update cursor position without waiting for decorative motion between steps. */
  animateCursor?: boolean;
  /** Native key delivery when the transport provides it. */
  pressKey?: (key: string, shift: boolean) => Promise<void>;
}

export const PAGE_TOOL_NAMES = new Set([
  "back",
  "check",
  "click",
  "cookies",
  "dblclick",
  "eval",
  "fill",
  "find",
  "focus",
  "forward",
  "frames",
  "get",
  "hover",
  "is",
  "press",
  "query",
  "scroll",
  "select",
  "snapshot",
  "storage",
  "type",
  "uncheck",
  "wait",
  "wait_for",
  "wait_for_js",
  "wait_for_text",
  "wait_for_url",
]);

const MAX_EVAL_RESULT = 64 * 1024;

export async function dispatchPageTool(
  name: string,
  payload: Record<string, unknown>,
  ctx: PageToolContext,
): Promise<unknown> {
  const tab = ctx;

  switch (name) {
    case "back": {
      await back(tab.cdp);
      return { ok: true };
    }
    case "forward": {
      await forward(tab.cdp);
      return { ok: true };
    }
    case "query": {
      const selector = String(payload.selector ?? "");
      if (!selector) throw new Error("selector required");
      const limit = clampInteger(payload.limit, 20, 1, 100);
      const offset = clampInteger(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      return await querySelectorAllSnapshot(tab.cdp, selector, limit, offset);
    }
    case "wait_for": {
      const selector = String(payload.selector ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!selector) throw new Error("selector required");
      const found = await waitForSelector(tab.cdp, selector, timeoutMs);
      return { found };
    }
    case "click": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await clickSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "dblclick": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await doubleClickSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "focus": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await focusSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "type": {
      const text = String(payload.text ?? "");
      const submit = payload.submit === true;
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await typeIntoSelector(tab.webContents, selector, text, submit);
      return { ok: true };
    }
    case "fill": {
      const text = String(payload.text ?? "");
      const submit = payload.submit === true;
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await fillSelector(tab.webContents, selector, text, submit);
      return { ok: true };
    }
    case "check": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await setCheckedSelector(tab.webContents, selector, true);
      return { ok: true };
    }
    case "uncheck": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await setCheckedSelector(tab.webContents, selector, false);
      return { ok: true };
    }
    case "select": {
      const value = String(payload.value ?? "");
      if (!value) throw new Error("value required");
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await selectOption(tab.webContents, selector, value);
      return { ok: true };
    }
    case "eval": {
      if (!ctx.allowEval) {
        return { error: "eval is disabled in Poracode settings" };
      }
      const expression = String(payload.js ?? "");
      if (!expression) throw new Error("js required");
      try {
        const result = await evalJs(tab.cdp, expression);
        let serialized: unknown = result;
        if (typeof result === "string" && result.length > MAX_EVAL_RESULT) {
          serialized = `${result.slice(0, MAX_EVAL_RESULT)}...[truncated]`;
        }
        return { result: serialized };
      } catch (err) {
        return { error: (err as Error).message ?? "eval failed" };
      }
    }
    case "snapshot": {
      const maxNodes = clampInteger(payload.maxNodes, 120, 1, 500);
      const offset = clampInteger(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      const mode = payload.mode === "compact" || payload.mode === "summary" ? payload.mode : "full";
      const maxTextLength =
        typeof payload.maxTextLength === "number"
          ? clampInteger(payload.maxTextLength, mode === "full" ? 200 : 80, 20, 1000)
          : undefined;
      const includeHidden = payload.includeHidden === true;
      return await pageSnapshot(tab.cdp, {
        maxNodes,
        offset,
        mode,
        ...(maxTextLength != null ? { maxTextLength } : {}),
        includeHidden,
        ...(payload.interactiveOnly === false ? { interactiveOnly: false } : {}),
        ...(payload.includeUrls === true ? { includeUrls: true } : {}),
        ...(typeof payload.selector === "string" ? { selector: payload.selector } : {}),
      });
    }
    case "get": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      const fieldsRaw = Array.isArray(payload.fields) ? (payload.fields as string[]) : ["text"];
      const fields = fieldsRaw.filter(
        (f): f is "text" | "html" | "value" | "attr" | "count" | "box" | "styles" =>
          ["text", "html", "value", "attr", "count", "box", "styles"].includes(f),
      );
      const attrName = typeof payload.attr === "string" ? payload.attr : undefined;
      const styles = Array.isArray(payload.styles) ? (payload.styles as string[]) : undefined;
      return await getElementInfo(tab.cdp, selector, fields, attrName, styles);
    }
    case "is": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      return await getElementState(tab.cdp, selector);
    }
    case "find": {
      return await findByA11y(tab.cdp, {
        ...(typeof payload.role === "string" ? { role: payload.role } : {}),
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.label === "string" ? { label: payload.label } : {}),
        ...(typeof payload.placeholder === "string" ? { placeholder: payload.placeholder } : {}),
        ...(typeof payload.text === "string" ? { text: payload.text } : {}),
        ...(typeof payload.testid === "string" ? { testid: payload.testid } : {}),
        ...(typeof payload.nth === "number" ? { nth: payload.nth } : {}),
        ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}),
        ...(typeof payload.visibleOnly === "boolean" ? { visibleOnly: payload.visibleOnly } : {}),
        ...(typeof payload.interactiveOnly === "boolean"
          ? { interactiveOnly: payload.interactiveOnly }
          : {}),
        ...(typeof payload.within === "string" ? { within: payload.within } : {}),
      });
    }
    case "hover": {
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      await hoverSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "press": {
      const key = String(payload.key ?? "");
      if (!key) throw new Error("key required");
      const hasTarget = typeof payload.selector === "string" || typeof payload.ref === "string";
      const selector = hasTarget ? await resolveSelectorArg(tab, payload) : undefined;
      if (hasTarget && !selector) throw new Error("selector or ref required");
      const shift = payload.shift === true;
      // Glide to a concrete target (like the other element-acting cases); an
      // untargeted page-level press has nowhere to move the cursor.
      if (selector) await glideCursorToSelector(tab.cdp, selector, ctx.animateCursor);
      if (ctx.pressKey) {
        if (selector) await focusSelector(tab.webContents, selector);
        await ctx.pressKey(key, shift);
      } else {
        await pressKey(tab.webContents, key, selector ?? undefined, { shift });
      }
      return { ok: true };
    }
    case "wait": {
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (typeof payload.ms === "number") {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, Math.min(60_000, payload.ms as number))),
        );
        return { ok: true };
      }
      if (typeof payload.selector === "string" && payload.selector.length > 0) {
        const found = await waitForSelector(tab.cdp, payload.selector, timeoutMs);
        return { found };
      }
      if (typeof payload.text === "string" && payload.text.length > 0) {
        await waitForText(tab.cdp, payload.text, timeoutMs);
        return { ok: true };
      }
      if (typeof payload.url === "string" && payload.url.length > 0) {
        const url = await waitForUrl(tab.cdp, payload.url, timeoutMs);
        return { url };
      }
      if (typeof payload.js === "string" && payload.js.length > 0) {
        if (!ctx.allowEval) {
          return { error: "wait.js requires eval to be enabled in settings" };
        }
        const result = await waitForJs(tab.cdp, payload.js, timeoutMs);
        return { result };
      }
      throw new Error("wait requires selector, text, url, js, or ms");
    }
    case "scroll": {
      const selector =
        typeof payload.selector === "string" || typeof payload.ref === "string"
          ? await resolveSelectorArg(tab, payload)
          : undefined;
      await scrollPage(tab.webContents, {
        ...(selector ? { selector } : {}),
        ...(typeof payload.x === "number" ? { x: payload.x } : {}),
        ...(typeof payload.y === "number" ? { y: payload.y } : {}),
      });
      return { ok: true };
    }
    case "wait_for_url": {
      const pattern = String(payload.pattern ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!pattern) throw new Error("pattern required");
      const url = await waitForUrl(tab.cdp, pattern, timeoutMs);
      return { url };
    }
    case "wait_for_text": {
      const text = String(payload.text ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!text) throw new Error("text required");
      await waitForText(tab.cdp, text, timeoutMs);
      return { ok: true };
    }
    case "wait_for_js": {
      if (!ctx.allowEval) {
        return { error: "wait_for_js requires eval to be enabled in settings" };
      }
      const expression = String(payload.js ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!expression) throw new Error("js required");
      const result = await waitForJs(tab.cdp, expression, timeoutMs);
      return { result };
    }
    case "cookies": {
      if (!ctx.allowDataAccess) {
        return {
          error:
            "cookies is disabled. Enable 'Allow agents to read/write cookies and storage' in Poracode settings.",
        };
      }
      const op = String(payload.op ?? "get") as "get" | "set" | "clear";
      if (op === "get") {
        const urls = Array.isArray(payload.urls) ? (payload.urls as string[]) : undefined;
        const cookies = await getCookies(tab.cdp, urls);
        return { cookies };
      }
      if (op === "set") {
        const cookie = payload.cookie as Parameters<typeof setCookie>[1] | undefined;
        if (!cookie || typeof cookie.name !== "string" || typeof cookie.value !== "string") {
          throw new Error("cookie.name and cookie.value required for op:set");
        }
        const ok = await setCookie(tab.cdp, cookie);
        return { ok };
      }
      if (op === "clear") {
        const filter = (payload.filter ?? undefined) as
          | { name?: string; domain?: string; url?: string }
          | undefined;
        return await clearCookies(tab.cdp, filter);
      }
      throw new Error(`unknown cookies op: ${op}`);
    }
    case "storage": {
      if (!ctx.allowDataAccess) {
        return {
          error:
            "storage is disabled. Enable 'Allow agents to read/write cookies and storage' in Poracode settings.",
        };
      }
      const kind = (payload.kind === "session" ? "session" : "local") as "local" | "session";
      const op = String(payload.op ?? "");
      if (op === "getAll") {
        const items = await storageGetAll(tab.cdp, kind);
        return { items };
      }
      if (op === "get") {
        const key = String(payload.key ?? "");
        if (!key) throw new Error("key required");
        const value = await storageGet(tab.cdp, kind, key);
        return { value };
      }
      if (op === "set") {
        const key = String(payload.key ?? "");
        const value = String(payload.value ?? "");
        if (!key) throw new Error("key required");
        await storageSet(tab.cdp, kind, key, value);
        return { ok: true };
      }
      if (op === "remove") {
        const key = String(payload.key ?? "");
        if (!key) throw new Error("key required");
        await storageRemove(tab.cdp, kind, key);
        return { ok: true };
      }
      if (op === "clear") {
        await storageClear(tab.cdp, kind);
        return { ok: true };
      }
      throw new Error(`unknown storage op: ${op}`);
    }
    case "frames": {
      const frames = await getFrameTree(tab.cdp);
      return { frames };
    }
    default:
      throw new Error(`unknown page tool: ${name}`);
  }
}
