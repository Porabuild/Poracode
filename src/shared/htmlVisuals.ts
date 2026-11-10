import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";
import type { McpAppCsp } from "./mcpAppSandbox";

/**
 * Public CDNs an authored page may load scripts, styles, fonts, and media from.
 * The sandbox still refuses fetch/XHR/WebSocket, frames, forms, and navigation.
 */
export const HTML_VISUAL_RESOURCE_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://cdnjs.cloudflare.com",
  "https://unpkg.com",
] as const;
export const HTML_VISUAL_CSP: McpAppCsp = { resourceDomains: [...HTML_VISUAL_RESOURCE_ORIGINS] };
export const HTML_VISUAL_MIN_HEIGHT = 80;
export const HTML_VISUAL_MAX_HEIGHT = 2000;
export const HTML_VISUAL_READY_TIMEOUT_MS = 15_000;
/** Minimum gap between links a page opens while a click keeps its frame active. */
export const HTML_VISUAL_LINK_INTERVAL_MS = 1000;
/** Each preview owns two sandboxed frames; later HTML blocks in a message stay source-only. */
export const MAX_HTML_VISUAL_PREVIEWS_PER_MESSAGE = 4;
/** The sandbox proxy bounds the whole document, so authored HTML leaves room for the bootstrap. */
export const MAX_HTML_VISUAL_SOURCE_BYTES = MAX_INLINE_VISUAL_BYTES - 8 * 1024;

/** App theme values the viewing client exposes to authored pages as CSS variables. */
export const HTML_VISUAL_THEME_VARIABLES = [
  "--background",
  "--foreground",
  "--surface",
  "--surface-secondary",
  "--muted",
  "--border",
  "--accent",
  "--accent-foreground",
  "--success",
  "--warning",
  "--danger",
  "--font-sans",
  "--font-mono",
] as const;

export type HtmlVisualThemeVariable = (typeof HTML_VISUAL_THEME_VARIABLES)[number];

export interface HtmlVisualTheme {
  appearance: "light" | "dark";
  variables: Partial<Record<HtmlVisualThemeVariable, string>>;
}

const SIZE_CHANGED_METHOD = "ui/notifications/size-changed";
const OPEN_LINK_METHOD = "ui/open-link";
const HOST_CONTEXT_CHANGED_METHOD = "ui/notifications/host-context-changed";
const THEME_VALUE = /^[^;{}<>\\\r\n]{1,256}$/u;

/**
 * Runs first inside the sandboxed page. It applies theme variables, reports the
 * content height, routes clicked web links to the host, and stands in for form
 * submission, which the script-only sandbox otherwise drops without an event.
 */
const BOOTSTRAP = String.raw`function (initial) {
  var style = document.createElement("style");
  var base = ":where(html){background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.5;-webkit-text-size-adjust:100%}:where(body){margin:0;padding:12px}:where(code,kbd,pre,samp){font-family:var(--font-mono)}";
  function apply(params) {
    if (!params || typeof params !== "object") return;
    var variables = params.styles && params.styles.variables;
    var css = ":root{color-scheme:" + (params.theme === "light" ? "light" : "dark") + ";";
    if (variables && typeof variables === "object") {
      for (var name in variables) {
        var value = variables[name];
        if (/^--[a-z0-9-]+$/.test(name) && typeof value === "string" && /${THEME_VALUE.source}/.test(value)) css += name + ":" + value + ";";
      }
    }
    style.textContent = css + "}" + base;
  }
  apply(initial);
  (document.head || document.documentElement).appendChild(style);
  function post(message) { parent.postMessage(message, "*"); }
  addEventListener("message", function (event) {
    var data = event.data;
    if (event.source === parent && data && data.jsonrpc === "2.0" && data.method === "${HOST_CONTEXT_CHANGED_METHOD}") apply(data.params);
  });
  var lastHeight = -1;
  var observer = typeof ResizeObserver === "function" ? new ResizeObserver(report) : null;
  function report() {
    var root = document.documentElement;
    var height = Math.ceil(root.scrollHeight > root.clientHeight ? root.scrollHeight : root.getBoundingClientRect().height);
    if (height === lastHeight) return;
    lastHeight = height;
    post({ jsonrpc: "2.0", method: "${SIZE_CHANGED_METHOD}", params: { height: height } });
  }
  if (observer) observer.observe(document.documentElement);
  document.addEventListener("DOMContentLoaded", function () {
    if (observer && document.body) observer.observe(document.body);
    report();
  });
  addEventListener("load", report);
  var links = 0;
  function openLink(href) {
    var url;
    try { url = new URL(href); } catch (error) { return; }
    if (url.protocol === "http:" || url.protocol === "https:") post({ jsonrpc: "2.0", id: "poracode-link-" + ++links, method: "${OPEN_LINK_METHOD}", params: { url: url.href } });
  }
  document.addEventListener("click", function (event) {
    var path = event.composedPath ? event.composedPath() : [];
    for (var index = 0; index < path.length; index++) {
      var node = path[index];
      if (!node || (node.localName !== "a" && node.localName !== "area") || !node.hasAttribute("href")) continue;
      var href = node.getAttribute("href").trim();
      if (/^javascript:/i.test(href)) return;
      event.preventDefault();
      if (href.charAt(0) === "#") {
        var target = null;
        try { target = href.length > 1 ? document.getElementById(decodeURIComponent(href.slice(1))) : null; } catch (error) {}
        if (target) target.scrollIntoView();
      } else if (event.isTrusted) {
        openLink(href);
      }
      return;
    }
  }, true);
  window.open = function (href) {
    if (href && (!navigator.userActivation || navigator.userActivation.isActive)) openLink(String(href));
    return null;
  };
  function submit(form, submitter) {
    if (!form.noValidate && !(submitter && submitter.formNoValidate) && !form.reportValidity()) return;
    var submitEvent;
    try { submitEvent = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter || null }); }
    catch (error) { submitEvent = new Event("submit", { bubbles: true, cancelable: true }); }
    form.dispatchEvent(submitEvent);
  }
  addEventListener("click", function (event) {
    var target = event.target;
    var button = !event.defaultPrevented && target && target.closest ? target.closest("button,input") : null;
    if (!button || !button.form || (button.type !== "submit" && button.type !== "image")) return;
    event.preventDefault();
    submit(button.form, button);
  });
  var blocking = /^(text|search|url|tel|email|password|date|month|week|time|datetime-local|number)$/;
  addEventListener("keydown", function (event) {
    var input = event.target;
    if (event.defaultPrevented || event.key !== "Enter" || event.isComposing || !input || input.localName !== "input" || !input.form || !blocking.test(input.type)) return;
    event.preventDefault();
    var form = input.form, fields = 0, button = null;
    for (var index = 0; index < form.elements.length; index++) {
      var element = form.elements[index];
      if (!button && (element.type === "submit" || element.type === "image") && (element.localName === "button" || element.localName === "input")) button = element;
      if (element.localName === "input" && blocking.test(element.type)) fields++;
    }
    if (button) {
      if (!button.disabled) button.click();
    } else if (fields === 1) {
      submit(form, null);
    }
  });
}`;

/**
 * Keeps only the documented variables with values that cannot leave a
 * declaration. Computed tokens such as font stacks can span lines.
 */
export function sanitizeHtmlVisualTheme(theme: HtmlVisualTheme): HtmlVisualTheme {
  const variables: HtmlVisualTheme["variables"] = {};
  for (const name of HTML_VISUAL_THEME_VARIABLES) {
    const value = theme.variables[name]?.replace(/\s+/gu, " ").trim();
    if (value && THEME_VALUE.test(value)) variables[name] = value;
  }
  return { appearance: theme.appearance === "light" ? "light" : "dark", variables };
}

/** MCP Apps host-context shape, so pages written for either host read the same fields. */
function themeParams(theme: HtmlVisualTheme) {
  const safe = sanitizeHtmlVisualTheme(theme);
  return { theme: safe.appearance, styles: { variables: safe.variables } };
}

export function htmlVisualThemeMessage(theme: HtmlVisualTheme) {
  return {
    jsonrpc: "2.0",
    method: HOST_CONTEXT_CHANGED_METHOD,
    params: themeParams(theme),
  } as const;
}

/**
 * The bootstrap precedes authored markup, so the parser places it in the head
 * of full documents and fragments alike, and it runs before any author script.
 */
export function buildHtmlVisualDocument(html: string, theme: HtmlVisualTheme): string {
  const initial = JSON.stringify(themeParams(theme)).replaceAll("<", "\\u003c");
  return `<!doctype html><script>(${BOOTSTRAP})(${initial})</script>${html}`;
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function htmlVisualSourceFits(html: string): boolean {
  return utf8Bytes(html) <= MAX_HTML_VISUAL_SOURCE_BYTES;
}

/** Mirrors the sandbox proxy, which silently drops a larger document. */
export function htmlVisualDocumentFits(document: string): boolean {
  return utf8Bytes(document) <= MAX_INLINE_VISUAL_BYTES;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readHtmlVisualHeight(message: unknown): number | undefined {
  const data = record(message);
  const height = record(data?.params)?.height;
  if (
    data?.method !== SIZE_CHANGED_METHOD ||
    typeof height !== "number" ||
    !Number.isFinite(height)
  )
    return undefined;
  return Math.min(HTML_VISUAL_MAX_HEIGHT, Math.max(HTML_VISUAL_MIN_HEIGHT, Math.ceil(height)));
}

/** Only absolute, credential-free web URLs leave the sandbox. */
export function readHtmlVisualLink(
  message: unknown,
): { id: string | number; url: string } | undefined {
  const data = record(message);
  const url = record(data?.params)?.url;
  if (
    data?.method !== OPEN_LINK_METHOD ||
    (typeof data.id !== "string" && typeof data.id !== "number") ||
    typeof url !== "string" ||
    url.length > 2048
  )
    return undefined;
  try {
    const target = new URL(url);
    return (target.protocol === "http:" || target.protocol === "https:") &&
      !target.username &&
      !target.password
      ? { id: data.id, url: target.href }
      : undefined;
  } catch {
    return undefined;
  }
}
