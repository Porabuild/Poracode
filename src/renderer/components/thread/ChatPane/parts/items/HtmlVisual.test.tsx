import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { MAX_HTML_VISUAL_SOURCE_BYTES } from "@/shared/htmlVisuals";
import { HtmlVisual } from "./HtmlVisual";

const sandbox = vi.hoisted(() => ({ endpoint: undefined as string | undefined }));
const openExternal = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());
vi.mock("./mcpAppSandboxEndpoint", () => ({
  useMcpAppSandboxEndpoint: () => sandbox.endpoint,
}));
vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ openExternal }),
}));
vi.mock("@/shared/htmlVisuals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/htmlVisuals")>()),
  HTML_VISUAL_READY_TIMEOUT_MS: 200,
}));

const html = '<button id="author-node" onclick="this.textContent=42">Calculate</button>';
const originalSettings = useSharedSettings.getState();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  sandbox.endpoint = "http://127.0.0.1:4400";
  openExternal.mockResolvedValue(undefined);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  openExternal.mockReset();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "userActivation");
  useSharedSettings.setState({
    themeMode: originalSettings.themeMode,
    locale: originalSettings.locale,
  });
  await dynamicActivate("en");
});

function visual(props: Partial<Parameters<typeof HtmlVisual>[0]> = {}) {
  return (
    <AppProvider>
      <HtmlVisual
        html={html}
        title="Calculator"
        version={1}
        complete
        isStreaming={false}
        limited={false}
        {...props}
      />
    </AppProvider>
  );
}

async function sandboxFrame(container: HTMLElement) {
  const frame = await waitFor(() => {
    const element = container.querySelector("iframe");
    expect(element?.getAttribute("src")).toContain("/mcp-apps/sandbox/v1");
    return element!;
  });
  const posted = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => undefined);
  const emit = (data: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data, source: frame.contentWindow, origin: "null" }),
      );
    });
  emit({ jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready" });
  const methods = () =>
    posted.mock.calls.map(([message]) => (message as { method?: string }).method);
  const size = (height: number) =>
    emit({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height } });
  return { frame, posted, emit, methods, size };
}

describe("HtmlVisual", () => {
  it("runs a finished block only inside the sandboxed proxy frame", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    const { container } = render(visual());
    expect(screen.getByRole("status")).toHaveTextContent("Loading preview…");
    const { frame, posted, size } = await sandboxFrame(container);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.title).toBe("Calculator");
    const delivered = (posted.mock.calls[0]![0] as { params: { html: string } }).params.html;
    expect(delivered.endsWith(`</script>${html}`)).toBe(true);
    expect(container.querySelector("#author-node, script")).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    expect(frame.hasAttribute("inert")).toBe(true);
    size(640);
    expect(frame.style.height).toBe("640px");
    expect(frame.hasAttribute("inert")).toBe(false);
    expect(screen.queryByText("Loading preview…")).toBeNull();
  });

  it("keeps unsupported, limited, oversized, streaming, and unfinished blocks inert", () => {
    for (const [props, status] of [
      [{ version: 2 }, "Unsupported HTML format. Showing source only."],
      [{ limited: true }, "Too many HTML previews in this message. Showing source only."],
      [
        { html: "x".repeat(MAX_HTML_VISUAL_SOURCE_BYTES + 1) },
        "This HTML block is too large to preview. Showing source only.",
      ],
      [{ isStreaming: true, complete: false }, "Receiving HTML source…"],
      [{ complete: false }, "Incomplete HTML block. Showing source only."],
    ] as const) {
      const { container, unmount } = render(visual(props));
      expect(screen.getByRole("status")).toHaveTextContent(status);
      expect(container.querySelector("iframe")).toBeNull();
      unmount();
    }
  });

  it("falls back to source without a sandbox host or when the page never reports", async () => {
    sandbox.endpoint = undefined;
    const { container, unmount } = render(visual());
    expect(screen.getByRole("status")).toHaveTextContent(
      "Interactive rendering is unavailable. Showing source only.",
    );
    expect(container.querySelector("pre")?.textContent).toBe(html);
    unmount();
    sandbox.endpoint = "http://127.0.0.1:4400";
    const stalled = render(visual());
    await sandboxFrame(stalled.container);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Interactive rendering is unavailable. Showing source only.",
      ),
    );
    expect(stalled.container.querySelector("iframe")).toBeNull();
    sandbox.endpoint = "http://127.0.0.1:4401";
    stalled.rerender(visual());
    const retried = await sandboxFrame(stalled.container);
    expect(retried.frame.getAttribute("src")).toMatch(
      /^http:\/\/127\.0\.0\.1:4401\/mcp-apps\/sandbox\/v1/,
    );
  });

  it("toggles source, copies the authored bytes, and expands into a second sandbox", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = render(visual());
    await sandboxFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Source" }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toBe(html);
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(html));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await sandboxFrame(container);
    fireEvent.click(screen.getByRole("button", { name: "Expand visual" }));
    await waitFor(() => expect(document.querySelectorAll("iframe")).toHaveLength(2));
  });

  it("opens a clicked web link through the host once per activation", async () => {
    const activation = { isActive: false, hasBeenActive: true };
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: activation });
    const { container } = render(visual());
    const { frame, emit, size } = await sandboxFrame(container);
    size(200);
    const link = (id: number) =>
      emit({ jsonrpc: "2.0", id, method: "ui/open-link", params: { url: "https://example.com/" } });
    link(1);
    expect(openExternal).not.toHaveBeenCalled();
    activation.isActive = true;
    link(2);
    expect(openExternal).not.toHaveBeenCalled();
    frame.focus();
    link(3);
    link(4);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith("https://example.com/");
  });

  it("follows app theme changes once the page is ready", async () => {
    act(() => useSharedSettings.getState().setThemeMode("dark"));
    const { container } = render(visual());
    const { methods, size, posted } = await sandboxFrame(container);
    size(200);
    act(() => useSharedSettings.getState().setThemeMode("light"));
    await waitFor(() => expect(methods()).toContain("ui/notifications/host-context-changed"));
    const update = posted.mock.calls
      .map(([message]) => message as { method?: string; params?: { theme?: string } })
      .find((message) => message.method === "ui/notifications/host-context-changed");
    expect(update?.params?.theme).toBe("light");
  });

  it("localizes the preview states", async () => {
    useSharedSettings.setState({ locale: "de" });
    await dynamicActivate("de");
    render(visual());
    expect(screen.getByRole("status")).toHaveTextContent("Vorschau wird geladen…");
  });
});
