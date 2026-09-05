import { performPageActions, readPerformSteps } from "./perform";
import {
  addInitScript,
  addInitStyle,
  evaluateOneShotStyle,
  removeInitScript,
} from "../../cdp/tools";

import { setCursorOverlayVisible } from "../../cursorOverlay";
import { agentTabOpts, clampInteger, requireTab, resolveTabId } from "./helpers";
import { runScreenshotTool } from "./screenshot";
import { compactToolSpec, normalizeToolName, TOOLS } from "./specs";
import type { ToolContext } from "./types";

import { dispatchPageTool, PAGE_TOOL_NAMES } from "./page";

/** Raw dispatch returning JS objects. The MCP wrapper formats these into the
 *  proper content shape. */
export async function dispatchTool(
  name: string,
  payload: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  name = normalizeToolName(name);
  if (name === "perform")
    readPerformSteps(payload, (ctx.disabledTools ?? []).map(normalizeToolName));
  if (name === "perform" || PAGE_TOOL_NAMES.has(name)) {
    const { tab } = await requireTab(ctx, payload);
    const page = {
      cdp: tab.cdp,
      webContents: tab.webContents,
      allowEval: ctx.allowEval,
      allowDataAccess: ctx.allowDataAccess,
      disabledTools: (ctx.disabledTools ?? []).map(normalizeToolName),
    };
    return name === "perform"
      ? performPageActions(payload, page)
      : dispatchPageTool(name, payload, page);
  }
  switch (name) {
    case "api":
      return {
        server: "browser",
        description:
          "Controls the Poracode in-app browser panel through tabs, navigation, inspection, input, screenshots, console, network, dialogs, cookies, and storage.",
        guidance: [
          "Prefer this MCP server over shell-driven browser automation when a page is visible in Poracode.",
          "Call enable before a browsing session and disable before pausing for user input or finishing.",
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
    case "enable": {
      ctx.manager.setAutomationSession(ctx.threadId ?? "unscoped", true);
      const tab = ctx.manager.getActiveTab();
      if (tab) {
        await ctx.manager.ensureTabReady(tab.tabId);
        await tab.cdp.attach();
        await setCursorOverlayVisible(tab.cdp, true);
      }
      return { enabled: true };
    }
    case "disable": {
      const shouldHidePresence = ctx.manager.setAutomationSession(
        ctx.threadId ?? "unscoped",
        false,
      );
      const tab = ctx.manager.getActiveTab();
      if (shouldHidePresence && tab) {
        await tab.cdp.attach();
        await setCursorOverlayVisible(tab.cdp, false);
      }
      return { enabled: false };
    }
    case "list_tabs":
      return ctx.manager.snapshot();
    case "new_tab": {
      const url = typeof payload.url === "string" ? payload.url : undefined;
      const activate = payload.activate !== false;
      return await ctx.manager.createTab({ ...(url ? { url } : {}), activate }, agentTabOpts(ctx));
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
