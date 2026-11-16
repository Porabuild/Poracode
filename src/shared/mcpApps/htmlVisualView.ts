import {
  HTML_VISUAL_CSP,
  HTML_VISUAL_LINK_INTERVAL_MS,
  HTML_VISUAL_READY_TIMEOUT_MS,
  buildHtmlVisualDocument,
  htmlVisualDocumentFits,
  htmlVisualThemeMessage,
  readHtmlVisualHeight,
  readHtmlVisualLink,
  type HtmlVisualTheme,
} from "../htmlVisuals";
import { McpAppFrameTransport, loadMcpAppSandbox } from "./viewBridge";

export interface HtmlVisualViewOptions {
  frame: HTMLIFrameElement;
  endpoint: string;
  /** Authored HTML; the sandbox document adds only the theme bootstrap. */
  html: string;
  theme: HtmlVisualTheme;
  signal: AbortSignal;
  /** Native content views use an ephemeral main frame and opaque nested frames. */
  inlineSandbox?: boolean;
  /** A validated web URL the user just clicked; native hosts still confirm before leaving the app. */
  openLink(url: string): void;
  onReady(): void;
  onHeight(height: number): void;
  onUnavailable(): void;
}

export interface HtmlVisualView {
  setTheme(theme: HtmlVisualTheme): void;
}

/**
 * Authored pages get the MCP App proxy and its opaque frames but no app
 * bridge: the host answers only size reports and validated link requests.
 */
export function mountHtmlVisual(options: HtmlVisualViewOptions): HtmlVisualView {
  const document = buildHtmlVisualDocument(options.html, options.theme);
  if (options.signal.aborted || !htmlVisualDocumentFits(document)) {
    if (!options.signal.aborted) options.onUnavailable();
    return { setTheme() {} };
  }
  const transport = new McpAppFrameTransport(options.frame, document);
  let ready = false;
  let lastLinkAt = 0;
  let themeKey = JSON.stringify(htmlVisualThemeMessage(options.theme));
  let pendingTheme: HtmlVisualTheme | undefined;
  const sendTheme = (theme: HtmlVisualTheme) => {
    void transport.send(htmlVisualThemeMessage(theme)).catch(() => undefined);
  };
  const timeout = window.setTimeout(options.onUnavailable, HTML_VISUAL_READY_TIMEOUT_MS);
  transport.onmessage = (message) => {
    const height = readHtmlVisualHeight(message);
    if (height !== undefined) {
      if (!ready) {
        ready = true;
        window.clearTimeout(timeout);
        options.onReady();
        if (pendingTheme) sendTheme(pendingTheme);
        pendingTheme = undefined;
      }
      options.onHeight(height);
      return;
    }
    const link = readHtmlVisualLink(message);
    if (!link) return;
    const now = Date.now();
    // A click inside this frame activates the focused window and focuses the
    // frame; a page posting on its own, or a click elsewhere, does not.
    const host = options.frame.ownerDocument;
    if (
      navigator.userActivation?.isActive === true &&
      host.hasFocus() &&
      host.activeElement === options.frame &&
      now - lastLinkAt >= HTML_VISUAL_LINK_INTERVAL_MS
    ) {
      lastLinkAt = now;
      options.openLink(link.url);
    }
    void transport.send({ jsonrpc: "2.0", id: link.id, result: {} }).catch(() => undefined);
  };
  options.signal.addEventListener(
    "abort",
    () => {
      window.clearTimeout(timeout);
      void transport.close();
    },
    { once: true },
  );
  void transport.start();
  loadMcpAppSandbox(options.frame, options.endpoint, HTML_VISUAL_CSP, options.inlineSandbox);
  return {
    setTheme(next) {
      const key = JSON.stringify(htmlVisualThemeMessage(next));
      if (key === themeKey || options.signal.aborted) return;
      themeKey = key;
      if (ready) sendTheme(next);
      else pendingTheme = next;
    },
  };
}
