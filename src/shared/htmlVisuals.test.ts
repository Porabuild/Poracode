import { describe, expect, it, vi } from "vitest";
import { MAX_INLINE_VISUAL_BYTES } from "./inlineVisuals";
import { buildMcpAppCsp } from "./mcpAppSandbox";
import {
  HTML_VISUAL_CSP,
  HTML_VISUAL_MAX_HEIGHT,
  HTML_VISUAL_MIN_HEIGHT,
  MAX_HTML_VISUAL_SOURCE_BYTES,
  buildHtmlVisualDocument,
  htmlVisualDocumentFits,
  htmlVisualSourceFits,
  htmlVisualThemeMessage,
  readHtmlVisualHeight,
  readHtmlVisualLink,
  sanitizeHtmlVisualTheme,
  type HtmlVisualTheme,
} from "./htmlVisuals";

type PageWindow = Window & typeof globalThis;
// jsdom ships no type declarations; describe only the API this suite uses.
const { JSDOM } = (await import("jsdom" as string)) as {
  JSDOM: new (
    html: string,
    options: { runScripts: "dangerously"; beforeParse(window: PageWindow): void },
  ) => { window: PageWindow };
};

const theme: HtmlVisualTheme = {
  appearance: "dark",
  variables: { "--background": "#070709", "--foreground": "#fafafa", "--accent": "#8892ef" },
};

function page(html: string) {
  const posted: unknown[] = [];
  const dom = new JSDOM(buildHtmlVisualDocument(html, theme), {
    runScripts: "dangerously",
    beforeParse(window) {
      window.postMessage = ((message: unknown) =>
        posted.push(message)) as typeof window.postMessage;
      window.HTMLElement.prototype.scrollIntoView = vi.fn<() => void>();
    },
  });
  const methods = () => posted.map((message) => (message as { method?: string }).method);
  return { dom, window: dom.window, document: dom.window.document, posted, methods };
}

describe("HTML visual sandbox policy", () => {
  it("admits only the public CDN resource origins and keeps fetch, frames, and forms closed", () => {
    const policy = buildMcpAppCsp(HTML_VISUAL_CSP);
    expect(policy).toContain("sandbox allow-scripts;");
    for (const origin of [
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com",
    ]) {
      for (const directive of ["script-src", "style-src", "img-src", "font-src"]) {
        expect(policy.split("; ").find((entry) => entry.startsWith(directive))).toContain(origin);
      }
    }
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).not.toMatch(/allow-same-origin|allow-popups|allow-top-navigation|'self'/u);
  });

  it("bounds authored HTML so the bootstrapped document still fits the proxy limit", () => {
    const largest = "x".repeat(MAX_HTML_VISUAL_SOURCE_BYTES);
    expect(htmlVisualSourceFits(largest)).toBe(true);
    expect(htmlVisualSourceFits(`${largest}x`)).toBe(false);
    expect(htmlVisualSourceFits("é".repeat(MAX_HTML_VISUAL_SOURCE_BYTES / 2 + 1))).toBe(false);
    const widest = sanitizeHtmlVisualTheme({
      appearance: "light",
      variables: Object.fromEntries(
        Object.keys({ ...theme.variables, "--font-sans": "", "--font-mono": "" }).map((name) => [
          name,
          "x".repeat(256),
        ]),
      ),
    });
    expect(htmlVisualDocumentFits(buildHtmlVisualDocument(largest, widest))).toBe(true);
    expect(htmlVisualDocumentFits("x".repeat(MAX_INLINE_VISUAL_BYTES + 1))).toBe(false);
  });
});

describe("HTML visual theme", () => {
  it("keeps documented variables whose values cannot leave a CSS declaration", () => {
    expect(
      sanitizeHtmlVisualTheme({
        appearance: "light",
        variables: {
          "--background": " oklch(0.97 0 0) ",
          "--font-sans": '-apple-system, "Segoe UI",\n      Roboto, sans-serif',
          "--foreground": "red;}</style><script>alert(1)</script>",
          "--accent": "x".repeat(257),
          "--muted": "",
          ...({ "--untrusted": "blue" } as HtmlVisualTheme["variables"]),
        },
      }),
    ).toEqual({
      appearance: "light",
      variables: {
        "--background": "oklch(0.97 0 0)",
        "--font-sans": '-apple-system, "Segoe UI", Roboto, sans-serif',
      },
    });
    expect(htmlVisualThemeMessage(theme)).toEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "dark", styles: { variables: theme.variables } },
    });
  });

  it("embeds the theme without letting a value close the bootstrap script", () => {
    const document = buildHtmlVisualDocument("<p>Hello</p>", {
      appearance: "dark",
      variables: { "--font-sans": '"</script><script>alert(1)//"' },
    });
    expect(document.startsWith("<!doctype html><script>")).toBe(true);
    expect(document.match(/<\/script/giu)).toHaveLength(1);
    expect(document.endsWith("</script><p>Hello</p>")).toBe(true);
  });
});

describe("HTML visual host messages", () => {
  it("clamps finite size reports and ignores everything else", () => {
    const size = (height: unknown) => ({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { height },
    });
    expect(readHtmlVisualHeight(size(321.2))).toBe(322);
    expect(readHtmlVisualHeight(size(0))).toBe(HTML_VISUAL_MIN_HEIGHT);
    expect(readHtmlVisualHeight(size(1e9))).toBe(HTML_VISUAL_MAX_HEIGHT);
    for (const message of [size(Number.NaN), size("400"), { method: "ui/open-link" }, null, []])
      expect(readHtmlVisualHeight(message)).toBeUndefined();
  });

  it("opens only absolute credential-free web links", () => {
    const link = (url: unknown, id: unknown = 7) => ({
      jsonrpc: "2.0",
      id,
      method: "ui/open-link",
      params: { url },
    });
    expect(readHtmlVisualLink(link("https://example.com/a b"))).toEqual({
      id: 7,
      url: "https://example.com/a%20b",
    });
    for (const message of [
      link("javascript:alert(1)"),
      link("file:///etc/passwd"),
      link("https://user:secret@example.com/"),
      link("/relative"),
      link(`https://example.com/${"x".repeat(2048)}`),
      link("https://example.com/", { nested: true }),
      { ...link("https://example.com/"), method: "ui/message" },
    ])
      expect(readHtmlVisualLink(message)).toBeUndefined();
  });
});

describe("HTML visual bootstrap", () => {
  it("themes the page before author markup and follows later theme changes from its host only", () => {
    const { window, document } = page("<style>p{color:red}</style><p>Hi</p>");
    const [bootstrap, author] = [...document.querySelectorAll("style")];
    expect(bootstrap!.textContent).toContain(":root{color-scheme:dark;--background:#070709;");
    expect(bootstrap!.compareDocumentPosition(author!) & 4).toBeTruthy();
    const message = (data: unknown, source: unknown = window) =>
      window.dispatchEvent(new window.MessageEvent("message", { data, source: source as Window }));
    message({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: {
        theme: "light",
        styles: { variables: { "--background": "#fff", "--accent": "red;} body{display:none" } },
      },
    });
    expect(bootstrap!.textContent).toContain(":root{color-scheme:light;--background:#fff;}");
    message({ ...htmlVisualThemeMessage(theme) }, null);
    expect(bootstrap!.textContent).toContain("color-scheme:light");
  });

  it("reports its content height to the host once the document is parsed", async () => {
    const { window, posted } = page("<p>Hi</p>");
    if (window.document.readyState !== "complete")
      await new Promise((resolve) => window.addEventListener("load", resolve));
    expect(posted).toContainEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { height: 0 },
    });
  });

  it("keeps every link from navigating the frame and routes window.open to the host", () => {
    const { window, document, posted, methods } = page(
      '<a id="web" href="https://example.com/docs">Docs</a><a id="frag" href="#target">Jump</a><a id="script" href="javascript:void 0">Run</a><h2 id="target">Target</h2>',
    );
    for (const id of ["web", "frag"]) {
      const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      document.getElementById(id)!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    }
    expect(document.getElementById("target")!.scrollIntoView).toHaveBeenCalled();
    const script = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("script")!.dispatchEvent(script);
    expect(script.defaultPrevented).toBe(false);
    // Synthetic clicks never reach the host; only a trusted click or open() does.
    expect(methods()).not.toContain("ui/open-link");
    expect(window.open("https://example.com/report")).toBeNull();
    window.open("data:text/html,hi");
    expect(posted.filter((message) => readHtmlVisualLink(message))).toEqual([
      {
        jsonrpc: "2.0",
        id: "poracode-link-1",
        method: "ui/open-link",
        params: { url: "https://example.com/report" },
      },
    ]);
  });

  it("delivers submit events the script-only sandbox would drop, including implicit submission", () => {
    const { window, document } = page(
      '<form id="calc"><input id="amount" required><button id="go">Go</button></form><form id="solo"><input id="only"></form>',
    );
    const submitted: string[] = [];
    for (const id of ["calc", "solo"]) {
      document.getElementById(id)!.addEventListener("submit", (event) => {
        event.preventDefault();
        submitted.push(`${id}:${(event as SubmitEvent).submitter?.id ?? "none"}`);
      });
    }
    document.getElementById("go")!.click();
    expect(submitted).toEqual([]);
    (document.getElementById("amount") as HTMLInputElement).value = "42";
    document.getElementById("go")!.click();
    const enter = (id: string) =>
      document
        .getElementById(id)!
        .dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    enter("amount");
    enter("only");
    expect(submitted).toEqual(["calc:go", "calc:go", "solo:none"]);
  });
});
