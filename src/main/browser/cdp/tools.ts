import type { CdpClient } from "./cdpClient";

interface RuntimeEvalResult {
  result: { type: string; subtype?: string; value?: unknown; description?: string };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

export async function evalJs<T = unknown>(cdp: CdpClient, expression: string): Promise<T> {
  const res = await cdp.send<RuntimeEvalResult>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  });
  if (res.exceptionDetails) {
    const msg =
      res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? "eval failed";
    throw new Error(msg);
  }
  return res.result.value as T;
}

export async function navigate(cdp: CdpClient, url: string): Promise<void> {
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url });
}

export async function reload(cdp: CdpClient): Promise<void> {
  await cdp.send("Page.reload");
}

interface HistoryResp {
  currentIndex: number;
  entries: Array<{ id: number; url: string; title: string }>;
}

export async function back(cdp: CdpClient): Promise<boolean> {
  const h = await cdp.send<HistoryResp>("Page.getNavigationHistory");
  if (h.currentIndex <= 0) return false;
  const entry = h.entries[h.currentIndex - 1];
  if (!entry) return false;
  await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id });
  return true;
}

export async function forward(cdp: CdpClient): Promise<boolean> {
  const h = await cdp.send<HistoryResp>("Page.getNavigationHistory");
  if (h.currentIndex >= h.entries.length - 1) return false;
  const entry = h.entries[h.currentIndex + 1];
  if (!entry) return false;
  await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id });
  return true;
}

export async function captureScreenshotPng(
  cdp: CdpClient,
  options: {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    format?: "png" | "jpeg";
    quality?: number;
    scale?: number;
    /** When true, allow the clip to reference document coordinates outside the
     *  current viewport so capture can happen without scrolling the page. */
    captureBeyondViewport?: boolean;
  },
): Promise<Buffer> {
  const params: Record<string, unknown> = { format: options.format ?? "png" };
  if (options.format === "jpeg" && typeof options.quality === "number") {
    params.quality = Math.max(1, Math.min(100, Math.floor(options.quality)));
  }
  const scale = Math.max(0.1, Math.min(1, options.scale ?? 1));
  if (options.clip) {
    params.clip = { ...options.clip, scale };
    if (options.captureBeyondViewport) {
      params.captureBeyondViewport = true;
    }
  } else if (options.fullPage) {
    await cdp.send("Page.enable");
    const metrics = await cdp.send<{
      cssContentSize?: { x: number; y: number; width: number; height: number };
      contentSize?: { x: number; y: number; width: number; height: number };
    }>("Page.getLayoutMetrics");
    const size = metrics.cssContentSize ?? metrics.contentSize;
    if (size) {
      params.clip = {
        x: Math.floor(size.x),
        y: Math.floor(size.y),
        width: Math.max(1, Math.ceil(size.width)),
        height: Math.max(1, Math.ceil(size.height)),
        scale,
      };
    }
    params.captureBeyondViewport = true;
  }
  const result = await cdp.send<{ data: string }>("Page.captureScreenshot", params);
  return Buffer.from(result.data, "base64");
}

export async function queryFirstRect(
  cdp: CdpClient,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const expr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`;
  return await evalJs<{ x: number; y: number; width: number; height: number } | null>(cdp, expr);
}

/** Returns the element's rect in document (page) coordinates without scrolling
 *  the element into view. Used for off-viewport screenshot clips paired with
 *  `captureBeyondViewport: true` so the user does not see the page scroll. */
export async function queryFirstDocumentRect(
  cdp: CdpClient,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const expr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    };
  })()`;
  return await evalJs<{ x: number; y: number; width: number; height: number } | null>(cdp, expr);
}

export async function waitForSelector(
  cdp: CdpClient,
  selector: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + Math.max(50, Math.min(60_000, timeoutMs));
  while (Date.now() < deadline) {
    const found = await evalJs<boolean>(
      cdp,
      `!!document.querySelector(${JSON.stringify(selector)})`,
    );
    if (found) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Concise structured snapshot of the current page. Returns visible elements
 * with role, accessible name, tag, short text, an opaque ref the agent can
 * pass back to other tools, plus location/visibility flags. Designed to be
 * cheap to serialize and small enough to feed back into an LLM context.
 */
export async function pageSnapshot(
  cdp: CdpClient,
  options: {
    maxNodes?: number;
    offset?: number;
    mode?: "full" | "compact" | "summary";
    maxTextLength?: number;
    includeHidden?: boolean;
    interactiveOnly?: boolean;
    includeUrls?: boolean;
    selector?: string;
  } = {},
): Promise<{
  url: string;
  title: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  mode: "full" | "compact" | "summary";
  nodes: Array<{
    ref: string;
    tag: string;
    role?: string;
    name?: string;
    text?: string;
    value?: string;
    href?: string;
    visible: boolean;
    rect: { x: number; y: number; width: number; height: number };
  }>;
}> {
  const maxNodes = Math.max(1, Math.min(500, options.maxNodes ?? 120));
  const offset = Math.max(0, options.offset ?? 0);
  const mode = options.mode === "compact" || options.mode === "summary" ? options.mode : "full";
  const maxTextLength = Math.max(
    20,
    Math.min(1000, options.maxTextLength ?? (mode === "full" ? 200 : 80)),
  );
  const includeHidden = options.includeHidden === true;
  const interactiveOnly = options.interactiveOnly !== false;
  const includeUrls = options.includeUrls === true;
  const expr = `(() => {
    const mode = ${JSON.stringify(mode)};
    const maxTextLength = ${maxTextLength};
    const out = { url: location.href, title: document.title || "", viewport: { width: innerWidth, height: innerHeight, scrollX: scrollX, scrollY: scrollY }, total: 0, offset: ${offset}, limit: ${maxNodes}, nextOffset: null, mode, nodes: [] };
    const root = ${JSON.stringify(options.selector ?? "")}
      ? document.querySelector(${JSON.stringify(options.selector ?? "")})
      : document;
    if (!root) return out;
    const VALID = new Set(["a","button","input","textarea","select","option","label","h1","h2","h3","h4","h5","h6","li","summary","details","form","img","nav","main","section","article","aside","footer","header","dialog","menu","menuitem"]);
    const STRUCTURAL = new Set(["h1","h2","h3","h4","h5","h6","li","form","nav","main","section","article","aside","footer","header"]);
    const SUMMARY = new Set(["h1","h2","h3","h4","h5","h6","form","nav","main","section","article","aside","footer","header","dialog","summary","details"]);
    const isInteractive = (el) => {
      const tag = el.tagName.toLowerCase();
      if (VALID.has(tag)) return true;
      if (el.getAttribute("role")) return true;
      if (el.tabIndex >= 0) return true;
      if (el.onclick || el.getAttribute("onclick")) return true;
      return false;
    };
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const accessibleName = (el) => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelled = el.getAttribute("aria-labelledby");
      if (labelled) {
        const ref = document.getElementById(labelled);
        if (ref) return (ref.textContent || "").trim();
      }
      if (el.tagName === "INPUT" && el.id) {
        const lab = document.querySelector(\`label[for="\${el.id.replace(/"/g, '\\\\"')}"]\`);
        if (lab) return (lab.textContent || "").trim();
      }
      const title = el.getAttribute("title");
      if (title) return title.trim();
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return placeholder.trim();
      const alt = el.getAttribute("alt");
      if (alt) return alt.trim();
      const text = (el.textContent || "").trim();
      return text.length > 0 && text.length < 120 ? text : "";
    };
    const trim = (s) => s && s.length > maxTextLength ? s.slice(0, maxTextLength) + "\\u2026" : s;
    const refs = (window.__lcRefs = window.__lcRefs || new Map());
    let counter = (window.__lcRefSeq = (window.__lcRefSeq || 0)) + 1;
    const all = root === document
      ? document.querySelectorAll("*")
      : [root, ...root.querySelectorAll("*")];
    const include = ${includeHidden ? "() => true" : "isVisible"};
    for (const el of all) {
      const tag = el.tagName.toLowerCase();
      if (tag === "body" && mode !== "full") continue;
      if (mode === "summary") {
        if (!isInteractive(el) && !SUMMARY.has(tag)) continue;
      } else if (!isInteractive(el) && (${interactiveOnly ? "true" : "!STRUCTURAL.has(tag)"}) && el.tagName !== "BODY") continue;
      if (!include(el)) continue;
      const matchIndex = out.total++;
      if (matchIndex < ${offset}) continue;
      if (out.nodes.length >= ${maxNodes}) continue;
      const ref = "@e" + (counter++);
      refs.set(ref, el);
      const r = el.getBoundingClientRect();
      const node = {
        ref,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || undefined,
        name: trim(accessibleName(el)) || undefined,
        visible: isVisible(el),
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      };
      const text = trim((el.textContent || "").trim());
      if (text && !(mode === "compact" && tag === "body")) node.text = text;
      if ("value" in el && typeof el.value === "string") node.value = trim(el.value);
      if (${includeUrls ? "true" : "false"} && el.tagName === "A" && el.href) node.href = el.href;
      out.nodes.push(node);
    }
    if (${offset} + out.nodes.length < out.total) out.nextOffset = ${offset} + out.nodes.length;
    window.__lcRefSeq = counter;
    return out;
  })()`;
  return await evalJs(cdp, expr);
}

export async function getElementInfo(
  cdp: CdpClient,
  selector: string,
  fields: ReadonlyArray<"text" | "html" | "value" | "attr" | "count" | "box" | "styles">,
  attrName?: string,
  styleNames?: ReadonlyArray<string>,
): Promise<Record<string, unknown>> {
  const expr = `(() => {
    const all = document.querySelectorAll(${JSON.stringify(selector)});
    const el = all[0];
    const out = {};
    const fields = ${JSON.stringify(fields)};
    const attrName = ${JSON.stringify(attrName ?? "")};
    const styleNames = ${JSON.stringify(styleNames ?? [])};
    const trim = (s, n) => s && s.length > n ? s.slice(0, n) + "\\u2026" : s;
    if (fields.includes("count")) out.count = all.length;
    if (!el) return out;
    if (fields.includes("text")) out.text = trim((el.textContent || "").trim(), 2000);
    if (fields.includes("html")) out.html = trim(el.outerHTML || "", 4000);
    if (fields.includes("value") && "value" in el) out.value = String(el.value);
    if (fields.includes("attr") && attrName) out.attr = el.getAttribute(attrName);
    if (fields.includes("box")) {
      const r = el.getBoundingClientRect();
      out.box = { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    if (fields.includes("styles") && styleNames.length > 0) {
      const cs = getComputedStyle(el);
      out.styles = Object.fromEntries(styleNames.map((n) => [n, cs.getPropertyValue(n)]));
    }
    return out;
  })()`;
  return await evalJs(cdp, expr);
}

export async function getElementState(
  cdp: CdpClient,
  selector: string,
): Promise<{
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  checked: boolean;
  focused: boolean;
}> {
  return await evalJs(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { exists: false, visible: false, enabled: false, checked: false, focused: false };
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible = style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && r.width > 0 && r.height > 0;
      const enabled = !("disabled" in el) || !el.disabled;
      const checked = "checked" in el ? !!el.checked : false;
      const focused = document.activeElement === el;
      return { exists: true, visible, enabled, checked, focused };
    })()`,
  );
}

export async function waitForJs(
  cdp: CdpClient,
  expression: string,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + Math.max(50, Math.min(60_000, timeoutMs));
  while (Date.now() < deadline) {
    try {
      const result = await evalJs(
        cdp,
        `(() => { try { return Boolean(${expression}); } catch { return false; } })()`,
      );
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

export async function waitForText(cdp: CdpClient, text: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + Math.max(50, Math.min(60_000, timeoutMs));
  const literal = JSON.stringify(text);
  while (Date.now() < deadline) {
    const found = await evalJs<boolean>(
      cdp,
      `(document.body && document.body.innerText && document.body.innerText.includes(${literal})) || false`,
    );
    if (found) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for text: ${text.slice(0, 80)}`);
}

export async function waitForUrl(
  cdp: CdpClient,
  pattern: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + Math.max(50, Math.min(60_000, timeoutMs));
  let isRegex = false;
  let re: RegExp | null = null;
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const end = pattern.lastIndexOf("/");
    try {
      re = new RegExp(pattern.slice(1, end), pattern.slice(end + 1));
      isRegex = true;
    } catch {}
  }
  while (Date.now() < deadline) {
    const url = await evalJs<string>(cdp, "location.href");
    if (isRegex && re ? re.test(url) : url.includes(pattern)) return url;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for URL: ${pattern}`);
}

export async function findByA11y(
  cdp: CdpClient,
  query: {
    role?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    text?: string;
    testid?: string;
    nth?: number;
    limit?: number;
    visibleOnly?: boolean;
    interactiveOnly?: boolean;
    within?: string;
  },
): Promise<{
  found: boolean;
  count: number;
  match?: {
    selector: string;
    rect: { x: number; y: number; width: number; height: number };
    ref: string;
    score: number;
    reason: string[];
    role?: string;
    name?: string;
    text?: string;
  };
  candidates?: Array<{
    selector: string;
    rect: { x: number; y: number; width: number; height: number };
    ref: string;
    score: number;
    reason: string[];
    role?: string;
    name?: string;
    text?: string;
  }>;
}> {
  const expr = `(() => {
    const q = ${JSON.stringify(query)};
    const candidates = [];
    const matchAttr = (el, name, value) => {
      const v = el.getAttribute(name);
      return v != null && (value ? v === value : true);
    };
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && r.width > 0 && r.height > 0;
    };
    const implicitRole = (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "button") return "button";
      if (tag === "a" && el.hasAttribute("href")) return "link";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "button" || type === "submit" || type === "reset") return "button";
        return "textbox";
      }
      return tag;
    };
    const isInteractive = (el) => {
      const tag = el.tagName.toLowerCase();
      if (["a","button","input","textarea","select"].includes(tag)) return true;
      if (el.getAttribute("role")) return true;
      if (el.tabIndex >= 0) return true;
      if (el.onclick || el.getAttribute("onclick")) return true;
      return false;
    };
    const labelText = (el) => {
      if (el.id) {
        const lab = document.querySelector(\`label[for="\${CSS.escape(el.id)}"]\`);
        if (lab) return (lab.textContent || "").trim();
      }
      const wrapping = el.closest("label");
      return wrapping ? (wrapping.textContent || "").trim() : "";
    };
    const accName = (el) => (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("alt") ||
      el.getAttribute("placeholder") ||
      labelText(el) ||
      (el.value && (el.tagName === "INPUT" || el.tagName === "BUTTON") ? String(el.value) : "") ||
      (el.textContent || "").trim()
    ).trim();
    const trim = (s, n) => s && s.length > n ? s.slice(0, n) + "\\u2026" : s;
    const selectorFor = (el) => {
      const path = [];
      let n = el;
      while (n && n.nodeType === 1 && n.tagName !== "HTML") {
        let part = n.tagName.toLowerCase();
        const p = n.parentElement;
        if (p) {
          const sibs = Array.from(p.children).filter((c) => c.tagName === n.tagName);
          if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(n) + 1) + ")";
        }
        path.unshift(part);
        n = p;
      }
      return path.join(" > ");
    };
    const score = (el) => {
      let s = 0;
      const reason = [];
      const role = (el.getAttribute("role") || implicitRole(el)).toLowerCase();
      const name = accName(el).toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();
      const childCount = el.children.length;
      if (q.role && role === q.role.toLowerCase()) {
        s += 80;
        reason.push("role");
      }
      if (q.testid && matchAttr(el, "data-testid", q.testid)) {
        s += 90;
        reason.push("testid");
      }
      if (q.placeholder && el.getAttribute("placeholder") === q.placeholder) {
        s += 70;
        reason.push("placeholder");
      }
      if (q.label && labelText(el).toLowerCase().includes(q.label.toLowerCase())) {
        s += 70;
        reason.push("label");
      }
      if (q.name) {
        const needle = q.name.toLowerCase();
        if (name === needle) {
          s += 100;
          reason.push("exact name");
        } else if (name.includes(needle)) {
          s += 60;
          reason.push("name");
        }
      }
      if (q.text) {
        const needle = q.text.toLowerCase();
        if (text === needle) {
          s += 60;
          reason.push("exact text");
        } else if (text.includes(needle)) {
          s += Math.max(5, 45 - childCount * 2);
          reason.push("text");
        }
      }
      if (["button","a","input","textarea","select"].includes(el.tagName.toLowerCase())) {
        s += 15;
        reason.push("native interactive");
      }
      if (el.tabIndex >= 0) {
        s += 10;
        reason.push("focusable");
      }
      if (["BODY","HTML","MAIN"].includes(el.tagName)) s -= 200;
      if (text.length > 600 || childCount > 30) s -= 80;
      return { score: s, reason };
    };
    const root = q.within ? document.querySelector(q.within) : document;
    if (!root) return { found: false, count: 0 };
    const all = root.querySelectorAll("*");
    for (const el of all) {
      if (q.visibleOnly !== false && !isVisible(el)) continue;
      if (q.interactiveOnly === true && !isInteractive(el)) continue;
      if (["SCRIPT","STYLE","NOSCRIPT","HTML","BODY"].includes(el.tagName)) continue;
      const role = (el.getAttribute("role") || implicitRole(el)).toLowerCase();
      if (q.testid && !matchAttr(el, "data-testid", q.testid)) continue;
      if (q.role && role !== q.role.toLowerCase()) continue;
      if (q.placeholder && el.getAttribute("placeholder") !== q.placeholder) continue;
      if (q.label) {
        const text = labelText(el).toLowerCase();
        if (!text.includes(q.label.toLowerCase())) continue;
      }
      if (q.name) {
        if (!accName(el).toLowerCase().includes(q.name.toLowerCase())) continue;
      }
      if (q.text) {
        const t = (el.textContent || "").toLowerCase();
        if (!t.includes(q.text.toLowerCase())) continue;
      }
      const scored = score(el);
      if (scored.score <= 0) continue;
      candidates.push({ el, score: scored.score, reason: scored.reason, role, name: accName(el), text: trim((el.textContent || "").trim(), 120) });
    }
    candidates.sort((a, b) => b.score - a.score);
    const refs = (window.__lcRefs = window.__lcRefs || new Map());
    let seq = (window.__lcRefSeq = (window.__lcRefSeq || 0));
    const idx = typeof q.nth === "number" ? q.nth : 0;
    const limit = Math.max(idx + 1, Math.min(20, Math.max(1, typeof q.limit === "number" ? q.limit : 5)));
    const results = candidates.slice(0, limit).map((candidate) => {
      const ref = "@e" + (++seq);
      refs.set(ref, candidate.el);
      const r = candidate.el.getBoundingClientRect();
      return {
        selector: selectorFor(candidate.el),
        ref,
        score: candidate.score,
        reason: candidate.reason,
        role: candidate.role || undefined,
        name: candidate.name || undefined,
        text: candidate.text || undefined,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      };
    });
    window.__lcRefSeq = seq;
    const match = results[idx];
    if (!match) return { found: false, count: candidates.length, candidates: results };
    return {
      found: true,
      count: candidates.length,
      match,
      candidates: results,
    };
  })()`;
  return await evalJs(cdp, expr);
}

export async function querySelectorAllSnapshot(
  cdp: CdpClient,
  selector: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{
  count: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  texts: string[];
  outerHtmls: string[];
  bounds: Array<{ x: number; y: number; width: number; height: number }>;
}> {
  const expr = `(() => {
    const all = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const off = ${Math.max(0, offset)};
    const lim = ${Math.max(1, Math.min(100, limit))};
    const slice = all.slice(off, off + lim);
    const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '\\u2026' : s;
    return {
      count: all.length,
      offset: off,
      limit: lim,
      nextOffset: off + slice.length < all.length ? off + slice.length : null,
      texts: slice.map((e) => truncate((e.textContent || '').trim(), 240)),
      outerHtmls: slice.map((e) => truncate(e.outerHTML || '', 1200)),
      bounds: slice.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }),
    };
  })()`;
  return await evalJs(cdp, expr);
}

// ============================================================================
// Cookies (CDP Network domain). Gated behind allowDataAccess at the dispatch
// layer; touching cookies could leak session tokens to the agent.
// ============================================================================

export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export async function getCookies(cdp: CdpClient, urls?: string[]): Promise<CdpCookie[]> {
  await cdp.send("Network.enable");
  const params: Record<string, unknown> = {};
  if (urls && urls.length > 0) params.urls = urls;
  const res = await cdp.send<{ cookies: CdpCookie[] }>("Network.getCookies", params);
  return res.cookies ?? [];
}

export async function setCookie(
  cdp: CdpClient,
  cookie: {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    expires?: number;
  },
): Promise<boolean> {
  await cdp.send("Network.enable");
  const res = await cdp.send<{ success: boolean }>("Network.setCookie", cookie);
  return res.success === true;
}

export async function clearCookies(
  cdp: CdpClient,
  filter?: { name?: string; domain?: string; url?: string },
): Promise<{ cleared: number }> {
  await cdp.send("Network.enable");
  if (!filter || (!filter.name && !filter.domain && !filter.url)) {
    await cdp.send("Network.clearBrowserCookies");
    return { cleared: -1 };
  }
  // Filtered deletion: list + delete matching cookies one at a time.
  const all = await getCookies(cdp, filter.url ? [filter.url] : undefined);
  let cleared = 0;
  for (const c of all) {
    if (filter.name && c.name !== filter.name) continue;
    if (filter.domain && c.domain !== filter.domain) continue;
    const delParams: Record<string, unknown> = {
      name: c.name,
      domain: c.domain,
      path: c.path,
    };
    try {
      await cdp.send("Network.deleteCookies", delParams);
      cleared++;
    } catch {}
  }
  return { cleared };
}

// ============================================================================
// Web storage (localStorage / sessionStorage) via Runtime.evaluate. Gated.
// ============================================================================

type StorageKind = "local" | "session";

function storageRef(kind: StorageKind): string {
  return kind === "local" ? "localStorage" : "sessionStorage";
}

export async function storageGetAll(
  cdp: CdpClient,
  kind: StorageKind,
): Promise<Array<{ key: string; value: string }>> {
  const ref = storageRef(kind);
  const expr = `(() => {
    const out = [];
    for (let i = 0; i < ${ref}.length; i++) {
      const k = ${ref}.key(i);
      if (k != null) out.push({ key: k, value: ${ref}.getItem(k) ?? "" });
    }
    return out;
  })()`;
  return await evalJs(cdp, expr);
}

export async function storageGet(
  cdp: CdpClient,
  kind: StorageKind,
  key: string,
): Promise<string | null> {
  const ref = storageRef(kind);
  return await evalJs<string | null>(cdp, `${ref}.getItem(${JSON.stringify(key)})`);
}

export async function storageSet(
  cdp: CdpClient,
  kind: StorageKind,
  key: string,
  value: string,
): Promise<void> {
  const ref = storageRef(kind);
  await evalJs(cdp, `${ref}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`);
}

export async function storageRemove(cdp: CdpClient, kind: StorageKind, key: string): Promise<void> {
  const ref = storageRef(kind);
  await evalJs(cdp, `${ref}.removeItem(${JSON.stringify(key)})`);
}

export async function storageClear(cdp: CdpClient, kind: StorageKind): Promise<void> {
  const ref = storageRef(kind);
  await evalJs(cdp, `${ref}.clear()`);
}

// ============================================================================
// Frame tree (Page domain).
// ============================================================================

export interface FrameTreeFrame {
  id: string;
  parentId?: string;
  url: string;
  name?: string;
  securityOrigin?: string;
  mimeType?: string;
}

interface RawFrame {
  id: string;
  parentId?: string;
  url: string;
  name?: string;
  securityOrigin?: string;
  mimeType?: string;
}

interface RawFrameTree {
  frame: RawFrame;
  childFrames?: RawFrameTree[];
}

function flattenFrameTree(tree: RawFrameTree, out: FrameTreeFrame[]): void {
  const flat: FrameTreeFrame = {
    id: tree.frame.id,
    url: tree.frame.url,
  };
  if (tree.frame.parentId) flat.parentId = tree.frame.parentId;
  if (tree.frame.name) flat.name = tree.frame.name;
  if (tree.frame.securityOrigin) flat.securityOrigin = tree.frame.securityOrigin;
  if (tree.frame.mimeType) flat.mimeType = tree.frame.mimeType;
  out.push(flat);
  for (const c of tree.childFrames ?? []) flattenFrameTree(c, out);
}

export async function getFrameTree(cdp: CdpClient): Promise<FrameTreeFrame[]> {
  await cdp.send("Page.enable");
  const res = await cdp.send<{ frameTree: RawFrameTree }>("Page.getFrameTree");
  const out: FrameTreeFrame[] = [];
  flattenFrameTree(res.frameTree, out);
  return out;
}

// ============================================================================
// Init scripts: addScriptToEvaluateOnNewDocument + matching style helper.
// ============================================================================

export async function addInitScript(
  cdp: CdpClient,
  source: string,
): Promise<{ identifier: string }> {
  await cdp.send("Page.enable");
  const res = await cdp.send<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", {
    source,
  });
  return res;
}

export async function removeInitScript(cdp: CdpClient, identifier: string): Promise<void> {
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

export async function addInitStyle(cdp: CdpClient, css: string): Promise<{ identifier: string }> {
  // Inject a script that appends a <style> tag on every new document load.
  const source = `(() => {
    if (!document || !document.documentElement) return;
    const style = document.createElement("style");
    style.setAttribute("data-lc-injected", "1");
    style.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(style);
  })()`;
  return await addInitScript(cdp, source);
}

export async function evaluateOneShotStyle(cdp: CdpClient, css: string): Promise<void> {
  await evalJs(
    cdp,
    `(() => {
      const style = document.createElement("style");
      style.setAttribute("data-lc-injected", "oneshot");
      style.textContent = ${JSON.stringify(css)};
      (document.head || document.documentElement).appendChild(style);
    })()`,
  );
}
