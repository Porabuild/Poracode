import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { InlineVisual } from "./InlineVisual";

const html = "<button onclick=\"this.textContent='Updated'\">Calculate</button>";
const originalSettings = useSharedSettings.getState();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  useSharedSettings.setState({
    themeMode: originalSettings.themeMode,
    locale: originalSettings.locale,
  });
  await dynamicActivate("en");
});

describe("InlineVisual source containment", () => {
  it("bounds a large source-only body while copying all original bytes", async () => {
    const source = '<script id="author-large">neverRun()</script>\n'.repeat(12000);
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container } = render(
      <AppProvider>
        <InlineVisual html={source} title="Large source" />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeTruthy();
    expect(container.textContent!.length).toBeLessThan(source.length);
    expect(container.querySelector("script, iframe, .lc-shiki")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(source));
  });

  it.each([
    [
      "RTC",
      '<script>new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:9"}]}).createOffer()</script>',
    ],
    [
      "fresh realm",
      "<iframe srcdoc=\"<script>parent.postMessage('author-ran','*')</script>\"></iframe>",
    ],
    ["local rewrite", '<script>document.open();document.write("<img src=/probe>")</script>'],
    [
      "worker",
      '<script>new Worker(URL.createObjectURL(new Blob(["fetch(\'/probe\')"])));new SharedWorker("/probe")</script>',
    ],
    [
      "resource and host access",
      '<base href="http://127.0.0.1:9/"><img id="author-node" src="probe"><script>window.poracode.invoke("tools/call");parent.postMessage({method:"ui/initialize"},"*")</script>',
    ],
  ])(
    "never parses or mounts %s author content, including after highlighting",
    async (kind, source) => {
      const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
      const { container } = render(
        <AppProvider>
          <InlineVisual html={source} title={kind} />
        </AppProvider>,
      );
      expect(container.querySelector("pre")?.textContent).toBe(source);
      await waitFor(() => expect(container.querySelector(".lc-shiki")).not.toBeNull(), {
        timeout: 5000,
      });
      expect(container.querySelector("pre")?.textContent).toBe(source);
      expect(
        container.querySelector("iframe, script, img, base, object, embed, #author-node"),
      ).toBeNull();
      expect(parse).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Interactive rendering is unavailable. Showing source only.",
      );
      expect(screen.queryByRole("button", { name: /Expand visual|Show visual/ })).toBeNull();
    },
  );

  it("distinguishes receiving source from a finished unclosed fence", () => {
    const { container, rerender } = render(
      <AppProvider>
        <InlineVisual html={html} complete={false} isStreaming />
      </AppProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Receiving HTML source…");
    rerender(
      <AppProvider>
        <InlineVisual html={html} complete={false} />
      </AppProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Incomplete HTML block. Showing source only.",
    );
    expect(container.querySelector("pre")?.textContent).toBe(html);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("copies exact source and preserves it across theme and title changes", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { container, rerender } = render(
      <AppProvider>
        <InlineVisual html={html} title="Calculator" />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(html));
    act(() => useSharedSettings.getState().setThemeMode("light"));
    rerender(
      <AppProvider>
        <InlineVisual html={html} title="Calculator updated" />
      </AppProvider>,
    );
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(screen.getByTitle("Calculator updated")).toHaveTextContent("Calculator updated");
    expect(container.querySelector("pre")?.textContent).toBe(html);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("does not create an MCP Apps session or reply to host-action requests", () => {
    const post = vi.spyOn(window, "postMessage");
    const { container, unmount } = render(
      <AppProvider>
        <InlineVisual html={html} />
      </AppProvider>,
    );
    for (const method of [
      "ui/initialize",
      "ui/notifications/initialized",
      "tools/call",
      "resources/read",
      "ui/message",
      "ui/open-link",
      "ui/update-model-context",
    ]) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            source: window,
            origin: "null",
            data: { jsonrpc: "2.0", id: 1, method, params: { name: "remove_worktree" } },
          }),
        );
      });
    }
    expect(container.querySelector("iframe")).toBeNull();
    expect(post).not.toHaveBeenCalled();
    unmount();
    expect(post).not.toHaveBeenCalled();
  });

  it("localizes the source-only title and unavailable state", async () => {
    useSharedSettings.setState({ locale: "de" });
    await dynamicActivate("de");
    render(
      <AppProvider>
        <InlineVisual html={html} />
      </AppProvider>,
    );
    expect(screen.getByTitle("HTML-Quelltext")).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Interaktive Darstellung ist nicht verfügbar. Es wird nur der Quelltext angezeigt.",
    );
    expect(screen.getByRole("button", { name: "Quelltext kopieren" })).toBeTruthy();
  });
});
