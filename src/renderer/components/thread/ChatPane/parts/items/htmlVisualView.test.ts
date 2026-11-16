import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_INLINE_VISUAL_BYTES } from "@/shared/inlineVisuals";
import {
  HTML_VISUAL_LINK_INTERVAL_MS,
  HTML_VISUAL_READY_TIMEOUT_MS,
  type HtmlVisualTheme,
} from "@/shared/htmlVisuals";
import { mountHtmlVisual, type HtmlVisualViewOptions } from "@/shared/mcpApps/htmlVisualView";

const theme: HtmlVisualTheme = { appearance: "dark", variables: { "--background": "#070709" } };
const light: HtmlVisualTheme = { appearance: "light", variables: { "--background": "#ffffff" } };
const ready = { jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready" };
const size = (height: number) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/size-changed",
  params: { height },
});
const owners: AbortController[] = [];

afterEach(() => {
  for (const owner of owners.splice(0)) owner.abort();
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, "userActivation");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mounted(overrides: Partial<HtmlVisualViewOptions> = {}) {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const emit = (
    data: unknown,
    source: MessageEventSource | null = frame.contentWindow,
    origin = "null",
  ) => window.dispatchEvent(new MessageEvent("message", { data, source, origin }));
  const owner = new AbortController();
  owners.push(owner);
  const callbacks = {
    openLink: vi.fn<(url: string) => void>(),
    onReady: vi.fn<() => void>(),
    onHeight: vi.fn<(height: number) => void>(),
    onUnavailable: vi.fn<() => void>(),
  };
  const view = mountHtmlVisual({
    frame,
    endpoint: "http://127.0.0.1:4400",
    html: '<p id="author-node">Hi</p>',
    theme,
    signal: owner.signal,
    ...callbacks,
    ...overrides,
  });
  // Loading the proxy replaces the frame's window; spy on the one the view targets.
  const posted = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => undefined);
  const methods = () =>
    posted.mock.calls.map(([message]) => (message as { method?: string }).method);
  return { frame, posted, emit, owner, view, methods, ...callbacks };
}

describe("HTML visual view", () => {
  it("delivers the bootstrapped page only to its own proxy, under the CDN-only policy", () => {
    const { frame, posted, emit } = mounted();
    const url = new URL(frame.src);
    expect(url.origin + url.pathname).toBe("http://127.0.0.1:4400/mcp-apps/sandbox/v1");
    expect(JSON.parse(url.searchParams.get("csp")!)).toEqual({
      resourceDomains: [
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
      ],
    });
    expect(new URLSearchParams(url.hash.slice(1)).get("parent")).toBe(window.location.origin);
    emit(ready, window);
    emit(ready, frame.contentWindow, "http://127.0.0.1:4400");
    expect(posted).not.toHaveBeenCalled();
    emit(ready);
    emit(ready);
    expect(posted).toHaveBeenCalledOnce();
    const [message, target] = posted.mock.calls[0]!;
    expect(target).toBe("*");
    expect(message).toMatchObject({ method: "ui/notifications/sandbox-resource-ready" });
    const html = (message as { params: { html: string } }).params.html;
    expect(html.startsWith("<!doctype html><script>")).toBe(true);
    expect(html.endsWith('</script><p id="author-node">Hi</p>')).toBe(true);
    expect(html).toContain('"--background":"#070709"');
    expect(document.getElementById("author-node")).toBeNull();
  });

  it("becomes ready on the first size report and defers theme changes until then", () => {
    const { emit, view, onReady, onHeight, methods } = mounted();
    emit(ready);
    view.setTheme(light);
    expect(methods()).not.toContain("ui/notifications/host-context-changed");
    emit(size(12));
    emit(size(640));
    expect(onReady).toHaveBeenCalledOnce();
    expect(onHeight.mock.calls).toEqual([[80], [640]]);
    expect(
      methods().filter((method) => method === "ui/notifications/host-context-changed"),
    ).toEqual(["ui/notifications/host-context-changed"]);
    view.setTheme(light);
    view.setTheme(theme);
    expect(
      methods().filter((method) => method === "ui/notifications/host-context-changed"),
    ).toHaveLength(2);
  });

  it("forwards only validated links from its own frame and answers the page", () => {
    const { frame, emit, posted, openLink } = mounted();
    emit(ready);
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: true, hasBeenActive: true },
    });
    frame.focus();
    const link = (url: string, id = 1) => ({
      jsonrpc: "2.0",
      id,
      method: "ui/open-link",
      params: { url },
    });
    emit(link("javascript:alert(1)"));
    emit(link("https://user:secret@example.com/"));
    emit(link("https://example.com/escape"), window);
    expect(openLink).not.toHaveBeenCalled();
    emit(link("https://example.com/docs", 9));
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://example.com/docs");
    expect(posted).toHaveBeenLastCalledWith({ jsonrpc: "2.0", id: 9, result: {} }, "*");
  });

  it("opens a link only on a fresh click, at most once per interval, and fails closed without the activation API", () => {
    vi.useFakeTimers();
    const { frame, emit, posted, openLink } = mounted();
    const link = (id: number) => ({
      jsonrpc: "2.0",
      id,
      method: "ui/open-link",
      params: { url: "https://example.com/" },
    });
    emit(ready);
    emit(link(1));
    expect(openLink).not.toHaveBeenCalled();
    expect(posted).toHaveBeenLastCalledWith({ jsonrpc: "2.0", id: 1, result: {} }, "*");
    const activation = { isActive: false, hasBeenActive: true };
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: activation });
    emit(link(2));
    expect(openLink).not.toHaveBeenCalled();
    activation.isActive = true;
    emit(link(3));
    expect(openLink).not.toHaveBeenCalled();
    frame.focus();
    emit(link(4));
    emit(link(5));
    expect(openLink).toHaveBeenCalledExactlyOnceWith("https://example.com/");
    vi.advanceTimersByTime(HTML_VISUAL_LINK_INTERVAL_MS);
    emit(link(6));
    expect(openLink).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    vi.advanceTimersByTime(HTML_VISUAL_LINK_INTERVAL_MS);
    emit(link(7));
    expect(openLink).toHaveBeenCalledTimes(2);
  });

  it("gives up when the page never reports and stays silent after its owner aborts", () => {
    vi.useFakeTimers();
    const stalled = mounted();
    vi.advanceTimersByTime(HTML_VISUAL_READY_TIMEOUT_MS);
    expect(stalled.onUnavailable).toHaveBeenCalledOnce();
    const closed = mounted();
    closed.emit(ready);
    closed.owner.abort();
    closed.emit(size(300));
    vi.advanceTimersByTime(HTML_VISUAL_READY_TIMEOUT_MS);
    expect(closed.onHeight).not.toHaveBeenCalled();
    expect(closed.onUnavailable).not.toHaveBeenCalled();
  });

  it("refuses a document the proxy would drop without loading it", () => {
    const { frame, onUnavailable } = mounted({ html: "x".repeat(MAX_INLINE_VISUAL_BYTES) });
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(frame.getAttribute("src")).toBeNull();
  });

  it("writes the proxy inline for native shells under the same leading policy", () => {
    const { frame } = mounted({ inlineSandbox: true });
    expect(frame.getAttribute("src")).toBeNull();
    expect(frame.srcdoc).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(frame.srcdoc).toContain("script-src 'unsafe-inline' https://cdn.jsdelivr.net");
    expect(frame.srcdoc).toContain("connect-src 'none'");
    expect(frame.srcdoc).not.toContain("sandbox allow-scripts;");
    expect(frame.srcdoc).toContain(JSON.stringify(window.location.origin));
  });
});
