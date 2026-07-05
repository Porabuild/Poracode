import {
  addInitScript,
  addInitStyle,
  back,
  clearCookies,
  evalJs,
  evaluateOneShotStyle,
  findByA11y,
  forward,
  getCookies,
  getElementInfo,
  getElementState,
  getFrameTree,
  pageSnapshot,
  querySelectorAllSnapshot,
  removeInitScript,
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
import { clampInteger, requireTab, resolveSelectorArg, resolveTabId } from "./helpers";
import { runScreenshotTool } from "./screenshot";
import { compactToolSpec, normalizeToolName, TOOLS } from "./specs";
import type { ToolContext } from "./types";

const MAX_EVAL_RESULT = 64 * 1024;

/** Raw dispatch returning JS objects. The MCP wrapper formats these into the
 *  proper content shape. */
export async function dispatchTool(
  name: string,
  payload: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (normalizeToolName(name)) {
    case "api":
      return {
        server: "browser",
        description:
          "Controls the Poracode in-app browser panel through tabs, navigation, inspection, input, screenshots, console, network, dialogs, cookies, and storage.",
        guidance: [
          "Prefer this MCP server over shell-driven browser automation when a page is visible in Poracode.",
          "Start with snapshot or find to identify @e refs before click, fill, type, hover, get, is, or scroll.",
          "Use fill for form fields when replacing text; use type only when appending text to the current value.",
          "Use wait after navigation or mutations instead of fixed sleeps unless a plain ms delay is intentional.",
          "Use requests and console after actions to verify web app behavior and diagnose failures.",
          "Use eval, cookies, and storage only when the corresponding Poracode setting allows it.",
        ],
        workflows: {
          inspect: ["list_tabs", "snapshot", "find", "get", "is"],
          navigate: ["new_tab", "open", "navigate", "back", "forward", "reload"],
          interact: [
            "click",
            "dblclick",
            "focus",
            "fill",
            "type",
            "check",
            "uncheck",
            "select",
            "press",
            "hover",
            "scroll",
            "wait",
          ],
          verify: ["screenshot", "console", "requests", "wait_for_url", "frames"],
          advanced: ["dialog", "addscript", "addstyle", "eval", "cookies", "storage"],
        },
        conventions: {
          refs: "snapshot/find return @e refs. Prefer passing ref over fragile CSS selectors.",
          aliases: {
            open: "navigate",
            goto: "navigate",
            inspect: "snapshot",
            key: "press",
            keyboard_type: "type",
          },
          snapshot:
            "Use interactiveOnly/includeUrls/selector to reduce output before handing page state to the model.",
        },
        tools: TOOLS.filter((tool) => tool.name !== "api").map(compactToolSpec),
        tabs: ctx.manager.snapshot(),
      };
    case "list_tabs":
      return ctx.manager.snapshot();
    case "new_tab": {
      const url = typeof payload.url === "string" ? payload.url : undefined;
      const activate = payload.activate !== false;
      return await ctx.manager.createTab({ ...(url ? { url } : {}), activate });
    }
    case "activate_tab": {
      ctx.manager.setActiveTab(String(payload.tabId ?? ""));
      return { ok: true };
    }
    case "close_tab": {
      await ctx.manager.closeTab(String(payload.tabId ?? ""));
      return { ok: true };
    }
    case "navigate": {
      const tabId = await resolveTabId(ctx, payload);
      const url = String(payload.url ?? "");
      if (!url) throw new Error("url required");
      await ctx.manager.navigate(tabId, url);
      return { ok: true, tabId };
    }
    case "back": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      await back(tab.cdp);
      return { ok: true };
    }
    case "forward": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      await forward(tab.cdp);
      return { ok: true };
    }
    case "reload": {
      const tabId = await resolveTabId(ctx, payload);
      await ctx.manager.reload(tabId);
      return { ok: true };
    }
    case "get_url": {
      const { tab } = await requireTab(ctx, payload);
      return { url: tab.snapshot().url };
    }
    case "get_title": {
      const { tab } = await requireTab(ctx, payload);
      return { title: tab.snapshot().title };
    }
    case "screenshot": {
      return await runScreenshotTool(ctx, payload);
    }
    case "query": {
      const { tab } = await requireTab(ctx, payload);
      const selector = String(payload.selector ?? "");
      if (!selector) throw new Error("selector required");
      await tab.cdp.attach();
      const limit = clampInteger(payload.limit, 20, 1, 100);
      const offset = clampInteger(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      return await querySelectorAllSnapshot(tab.cdp, selector, limit, offset);
    }
    case "wait_for": {
      const { tab } = await requireTab(ctx, payload);
      const selector = String(payload.selector ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!selector) throw new Error("selector required");
      await tab.cdp.attach();
      const found = await waitForSelector(tab.cdp, selector, timeoutMs);
      return { found };
    }
    case "click": {
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await clickSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "dblclick": {
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await doubleClickSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "focus": {
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await focusSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "type": {
      const { tab } = await requireTab(ctx, payload);
      const text = String(payload.text ?? "");
      const submit = payload.submit === true;
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await typeIntoSelector(tab.webContents, selector, text, submit);
      return { ok: true };
    }
    case "fill": {
      const { tab } = await requireTab(ctx, payload);
      const text = String(payload.text ?? "");
      const submit = payload.submit === true;
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await fillSelector(tab.webContents, selector, text, submit);
      return { ok: true };
    }
    case "check": {
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await setCheckedSelector(tab.webContents, selector, true);
      return { ok: true };
    }
    case "uncheck": {
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await setCheckedSelector(tab.webContents, selector, false);
      return { ok: true };
    }
    case "select": {
      const { tab } = await requireTab(ctx, payload);
      const value = String(payload.value ?? "");
      if (!value) throw new Error("value required");
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await selectOption(tab.webContents, selector, value);
      return { ok: true };
    }
    case "eval": {
      if (!ctx.allowEval) {
        return { error: "eval is disabled in Poracode settings" };
      }
      const { tab } = await requireTab(ctx, payload);
      const expression = String(payload.js ?? "");
      if (!expression) throw new Error("js required");
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      return await getElementState(tab.cdp, selector);
    }
    case "find": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      const selector = await resolveSelectorArg(tab, payload);
      if (!selector) throw new Error("selector or ref required");
      await hoverSelector(tab.webContents, selector);
      return { ok: true };
    }
    case "press": {
      const { tab } = await requireTab(ctx, payload);
      const key = String(payload.key ?? "");
      if (!key) throw new Error("key required");
      const hasTarget = typeof payload.selector === "string" || typeof payload.ref === "string";
      const selector = hasTarget ? await resolveSelectorArg(tab, payload) : undefined;
      if (hasTarget && !selector) throw new Error("selector or ref required");
      const shift = payload.shift === true;
      await pressKey(tab.webContents, key, selector ?? undefined, { shift });
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const pattern = String(payload.pattern ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!pattern) throw new Error("pattern required");
      const url = await waitForUrl(tab.cdp, pattern, timeoutMs);
      return { url };
    }
    case "wait_for_text": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const expression = String(payload.js ?? "");
      const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 5000;
      if (!expression) throw new Error("js required");
      const result = await waitForJs(tab.cdp, expression, timeoutMs);
      return { result };
    }
    case "console": {
      const { tab } = await requireTab(ctx, payload);
      const limit = clampInteger(payload.limit, 50, 1, 100);
      const offset = clampInteger(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      const level =
        typeof payload.level === "string"
          ? (payload.level as "log" | "warn" | "error" | "info" | "debug" | "exception")
          : undefined;
      let entries = tab.getConsoleEntries();
      if (level) entries = entries.filter((e) => e.level === level);
      const page = entries.slice(offset, offset + limit);
      if (payload.clear === true) tab.clearConsole();
      return {
        count: entries.length,
        offset,
        limit,
        nextOffset: offset + page.length < entries.length ? offset + page.length : null,
        entries: page,
      };
    }
    case "requests": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      if (!tab.network.isEnabled()) {
        await tab.network.enable(tab.cdp);
      }
      const filter = typeof payload.filter === "string" ? payload.filter : undefined;
      const limit = clampInteger(payload.limit, 50, 1, 100);
      const offset = clampInteger(payload.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      const entries = tab.network.list({ ...(filter ? { filter } : {}), limit: 500 });
      const page = entries.slice(offset, offset + limit);
      if (payload.clear === true) tab.network.clear();
      return {
        count: entries.length,
        offset,
        limit,
        nextOffset: offset + page.length < entries.length ? offset + page.length : null,
        requests: page,
      };
    }
    case "cookies": {
      if (!ctx.allowDataAccess) {
        return {
          error:
            "cookies is disabled. Enable 'Allow agents to read/write cookies and storage' in Poracode settings.",
        };
      }
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
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
    case "dialog": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const op = String(payload.op ?? "set") as "set" | "wait" | "recent";
      if (op === "recent") {
        const limit = typeof payload.limit === "number" ? payload.limit : 10;
        return { dialogs: tab.dialogs.recent(limit) };
      }
      const action = (payload.action === "dismiss" ? "dismiss" : "accept") as "accept" | "dismiss";
      const promptText = typeof payload.promptText === "string" ? payload.promptText : undefined;
      const disposition = {
        action,
        ...(promptText != null ? { promptText } : {}),
      };
      if (op === "set") {
        tab.dialogs.setNextDisposition(disposition);
        return { ok: true, armed: disposition };
      }
      if (op === "wait") {
        const timeoutMs = typeof payload.timeoutMs === "number" ? payload.timeoutMs : 10_000;
        const entry = await tab.dialogs.waitForNext(disposition, timeoutMs);
        return entry ? { dialog: entry } : { dialog: null };
      }
      throw new Error(`unknown dialog op: ${op}`);
    }
    case "frames": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const frames = await getFrameTree(tab.cdp);
      return { frames };
    }
    case "addscript": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const op = String(payload.op ?? "add") as "add" | "remove" | "removeAll";
      if (op === "add") {
        const source = String(payload.source ?? "");
        if (!source) throw new Error("source required");
        const res = await addInitScript(tab.cdp, source);
        tab.rememberInitScript(res.identifier);
        return { identifier: res.identifier };
      }
      if (op === "remove") {
        const identifier = String(payload.identifier ?? "");
        if (!identifier) throw new Error("identifier required");
        await removeInitScript(tab.cdp, identifier);
        tab.forgetInitScript(identifier);
        return { ok: true };
      }
      if (op === "removeAll") {
        const ids = tab.listInitScripts();
        for (const id of ids) {
          try {
            await removeInitScript(tab.cdp, id);
          } catch {}
          tab.forgetInitScript(id);
        }
        return { ok: true, removed: ids.length };
      }
      throw new Error(`unknown addscript op: ${op}`);
    }
    case "addstyle": {
      const { tab } = await requireTab(ctx, payload);
      await tab.cdp.attach();
      const op = String(payload.op ?? "add") as "add" | "oneshot";
      const css = String(payload.css ?? "");
      if (!css) throw new Error("css required");
      if (op === "add") {
        const res = await addInitStyle(tab.cdp, css);
        tab.rememberInitScript(res.identifier);
        return { identifier: res.identifier };
      }
      if (op === "oneshot") {
        await evaluateOneShotStyle(tab.cdp, css);
        return { ok: true };
      }
      throw new Error(`unknown addstyle op: ${op}`);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
