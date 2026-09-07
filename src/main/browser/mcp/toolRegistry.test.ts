import { describe, expect, it, vi } from "vitest";
import {
  BROWSER_MCP_INSTRUCTIONS,
  TOOLS,
  dispatchTool,
  formatToolResult,
  isKnownToolName,
  type ToolContext,
} from "./toolRegistry";

function createContext(): ToolContext {
  return {
    allowDataAccess: false,
    allowEval: false,
    manager: {
      snapshot: () => ({
        tabs: [
          {
            tabId: "tab-1",
            url: "https://example.com/",
            title: "Example",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            devToolsOpen: false,
          },
        ],
        activeTabId: "tab-1",
      }),
    } as ToolContext["manager"],
  };
}

function createDispatchContext(send: ReturnType<typeof vi.fn>): ToolContext {
  const tab = {
    tabId: "tab-1",
    snapshot: () => ({ url: "https://example.test/page", title: "Example Page" }),
    webContents: {
      focus: vi.fn<() => void>(),
      executeJavaScript: vi
        .fn<(script: string, userGesture?: boolean) => Promise<unknown>>()
        .mockResolvedValue(true),
      capturePage: vi
        .fn<
          () => Promise<{
            toPNG: () => Buffer;
            toJPEG: (quality: number) => Buffer;
            getSize: () => { width: number; height: number };
            resize: () => unknown;
          }>
        >()
        .mockResolvedValue({
          toPNG: () => Buffer.from("png"),
          toJPEG: () => Buffer.from("jpg"),
          getSize: () => ({ width: 800, height: 600 }),
          resize() {
            return this;
          },
        }),
    },
    cdp: {
      attach: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      send,
    },
    network: {
      isEnabled: () => true,
      enable: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      list: () => [],
      clear: vi.fn<() => void>(),
    },
    dialogs: {
      recent: () => [],
      setNextDisposition: vi.fn<() => void>(),
      waitForNext: vi.fn<() => Promise<null>>().mockResolvedValue(null),
    },
    getConsoleEntries: () => [],
    clearConsole: vi.fn<() => void>(),
    rememberInitScript: vi.fn<() => void>(),
    forgetInitScript: vi.fn<() => void>(),
    listInitScripts: () => ["script-1"],
  };
  return {
    allowDataAccess: true,
    allowEval: true,
    manager: {
      snapshot: () => ({
        tabs: [
          {
            tabId: "tab-1",
            url: "https://example.test/page",
            title: "Example Page",
            loading: false,
            canGoBack: false,
            canGoForward: false,
            devToolsOpen: false,
          },
        ],
        activeTabId: "tab-1",
      }),
      getActiveTab: () => tab,
      getTab: () => tab,
      ensureTabReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      createTab: vi.fn<() => Promise<unknown>>().mockResolvedValue({ tabId: "tab-1" }),
      setAutomationSession: vi.fn<() => boolean>().mockReturnValue(true),
      setActiveTab: vi.fn<() => void>(),
      closeTab: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      navigate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      reload: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as ToolContext["manager"],
  };
}

function createRoutingSend(): ReturnType<typeof vi.fn> {
  return vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(
    async (method, params) => {
      if (method === "Runtime.evaluate") {
        const expression = String(params?.expression ?? "");
        if (expression === "location.href") {
          return { result: { type: "string", value: "https://example.test/page" } };
        }
        return { result: { type: "boolean", value: true } };
      }
      if (method === "Page.getNavigationHistory") {
        return {
          currentIndex: 1,
          entries: [
            { id: 1, url: "https://example.test/one", title: "One" },
            { id: 2, url: "https://example.test/two", title: "Two" },
            { id: 3, url: "https://example.test/three", title: "Three" },
          ],
        };
      }
      if (method === "Page.captureScreenshot") {
        return { data: Buffer.from("png").toString("base64") };
      }
      if (method === "Page.getLayoutMetrics") {
        return { cssContentSize: { x: 0, y: 0, width: 800, height: 600 } };
      }
      if (method === "Network.getCookies") {
        return { cookies: [] };
      }
      if (method === "Network.setCookie") {
        return { success: true };
      }
      if (method === "Page.getFrameTree") {
        return { frameTree: { frame: { id: "main", url: "https://example.test/" } } };
      }
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        return { identifier: "script-1" };
      }
      return {};
    },
  );
}

const ROUTING_ARGS: Record<string, Record<string, unknown>> = {
  api: {},
  perform: { steps: [{ action: "fill", selector: "input", text: "Ada" }], observe: "none" },
  enable: {},
  disable: {},
  list_tabs: {},
  new_tab: { url: "https://example.test/", activate: true },
  open: { url: "https://example.test/open" },
  activate_tab: { tabId: "tab-1" },
  close_tab: { tabId: "tab-1" },
  navigate: { url: "https://example.test/nav" },
  back: {},
  forward: {},
  reload: {},
  get_url: {},
  get_title: {},
  screenshot: {},
  query: { selector: "input" },
  wait_for: { selector: "input", timeoutMs: 50 },
  click: { selector: "button" },
  dblclick: { selector: "button" },
  focus: { selector: "input" },
  type: { selector: "input", text: "abc" },
  fill: { selector: "input", text: "abc" },
  check: { selector: "input[type=checkbox]" },
  uncheck: { selector: "input[type=checkbox]" },
  select: { selector: "select", value: "pro" },
  eval: { js: "true" },
  snapshot: {},
  inspect: {},
  get: { selector: "input", fields: ["text"] },
  is: { selector: "input" },
  find: { text: "Example" },
  hover: { selector: "button" },
  press: { selector: "input", key: "Enter" },
  wait: { selector: "input", timeoutMs: 50 },
  scroll: { y: 100 },
  wait_for_url: { pattern: "example.test", timeoutMs: 50 },
  wait_for_text: { text: "Example", timeoutMs: 50 },
  wait_for_js: { js: "true", timeoutMs: 50 },
  console: {},
  requests: {},
  cookies: { op: "get" },
  storage: { kind: "local", op: "getAll" },
  dialog: { op: "recent" },
  frames: {},
  addscript: { op: "add", source: "window.__ok = true" },
  addstyle: { op: "oneshot", css: "body { color: red; }" },
};

describe("browser MCP tool registry", () => {
  it("surfaces an API map as the first tool", async () => {
    expect(TOOLS[0]?.name).toBe("api");
    expect(isKnownToolName("api")).toBe(true);

    const result = (await dispatchTool("api", {}, createContext())) as {
      guidance: string[];
      workflows: Record<string, string[]>;
      tools: Array<{ name: string }>;
      tabs: { activeTabId: string | null };
    };

    expect(result.guidance.join(" ")).toContain("Prefer this MCP server");
    expect(result.guidance.join(" ")).toContain("@e refs");
    expect(result.workflows.inspect).toContain("snapshot");
    expect(result.workflows.interact).toEqual(
      expect.arrayContaining(["fill", "focus", "check", "uncheck", "select", "wait"]),
    );
    expect(result.tools.map((tool) => tool.name)).toContain("click");
    expect(result.tools.map((tool) => tool.name)).toContain("fill");
    expect(result.tabs.activeTabId).toBe("tab-1");
  });

  it("formats the API result for MCP clients", async () => {
    const result = await dispatchTool("api", {}, createContext());
    const formatted = formatToolResult("api", result);

    expect(BROWSER_MCP_INSTRUCTIONS).toContain("call browser.api");
    expect(BROWSER_MCP_INSTRUCTIONS).toContain("browser.enable");
    expect(BROWSER_MCP_INSTRUCTIONS).toContain("browser.disable");
    expect(formatted.content[0]?.type).toBe("text");
    expect(formatted.content[0]?.text).toContain('"workflows"');
    expect(formatted.content[0]?.text).toContain('"args"');
    expect(formatted.content[0]?.text).not.toContain('"inputSchema"');
    expect(formatted.content[0]?.text?.length).toBeLessThan(20_000);
  });

  it("advertises passive and state-changing tool annotations", () => {
    expect(TOOLS.find((tool) => tool.name === "snapshot")?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(TOOLS.find((tool) => tool.name === "click")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });

  it("recognizes agent-browser-style aliases", () => {
    expect(isKnownToolName("goto")).toBe(true);
    expect(isKnownToolName("key")).toBe(true);
    expect(isKnownToolName("keyboard_type")).toBe(true);
  });

  it("dispatches optimized form and interaction commands", async () => {
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);

    await expect(
      dispatchTool("fill", { selector: "#email", text: "test@example.com" }, ctx),
    ).resolves.toEqual({ ok: true });
    await expect(dispatchTool("focus", { selector: "#email" }, ctx)).resolves.toEqual({
      ok: true,
    });
    await expect(dispatchTool("click", { selector: "#submit" }, ctx)).resolves.toEqual({
      ok: true,
    });
    await expect(dispatchTool("type", { selector: "#email", text: "abc" }, ctx)).resolves.toEqual({
      ok: true,
    });
    await expect(dispatchTool("press", { selector: "#email", key: "Enter" }, ctx)).resolves.toEqual(
      {
        ok: true,
      },
    );
    await expect(dispatchTool("check", { selector: "#remember" }, ctx)).resolves.toEqual({
      ok: true,
    });
    await expect(dispatchTool("select", { selector: "#plan", value: "pro" }, ctx)).resolves.toEqual(
      { ok: true },
    );

    const activeTab = ctx.manager.getActiveTab() as unknown as {
      webContents: {
        executeJavaScript: ReturnType<typeof vi.fn>;
        focus: ReturnType<typeof vi.fn>;
      };
      cdp: { attach: ReturnType<typeof vi.fn> };
    };
    expect(send).not.toHaveBeenCalledWith("Input.insertText", { text: "test@example.com" });
    expect(send.mock.calls.some(([method]) => String(method).startsWith("Input."))).toBe(false);
    expect(activeTab.webContents.executeJavaScript).toHaveBeenCalled();
    expect(
      activeTab.webContents.executeJavaScript.mock.calls.some(([script]) =>
        String(script).includes('press("Enter", "#email", false)'),
      ),
    ).toBe(true);
    expect(activeTab.cdp.attach).not.toHaveBeenCalled();
    expect(activeTab.webContents.focus).not.toHaveBeenCalled();
  });

  it("keeps browser automation presence active between enable and disable", async () => {
    const ctx = createDispatchContext(createRoutingSend());

    await expect(dispatchTool("enable", {}, ctx)).resolves.toEqual({ enabled: true });
    await expect(dispatchTool("disable", {}, ctx)).resolves.toEqual({ enabled: false });

    expect(ctx.manager.setAutomationSession).toHaveBeenNthCalledWith(1, "unscoped", true);
    expect(ctx.manager.setAutomationSession).toHaveBeenNthCalledWith(2, "unscoped", false);
  });

  it("dispatches every advertised browser tool through the browser context", async () => {
    const toolNames = TOOLS.map((tool) => tool.name);
    expect(Object.keys(ROUTING_ARGS).sort()).toEqual([...toolNames].sort());

    for (const toolName of toolNames) {
      const send = createRoutingSend();
      const ctx = createDispatchContext(send);
      await expect(dispatchTool(toolName, ROUTING_ARGS[toolName] ?? {}, ctx)).resolves.toBeTruthy();
    }
  });

  it("routes reload, get_url, and fill to the active browser tab", async () => {
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);

    await expect(dispatchTool("reload", {}, ctx)).resolves.toEqual({ ok: true });
    await expect(dispatchTool("get_url", {}, ctx)).resolves.toEqual({
      url: "https://example.test/page",
    });
    await expect(
      dispatchTool("fill", { selector: "input", text: "hello", submit: true }, ctx),
    ).resolves.toEqual({ ok: true });

    expect(ctx.manager.reload).toHaveBeenCalledWith("tab-1");
    expect(send).not.toHaveBeenCalledWith("Input.insertText", { text: "hello" });
    expect(send.mock.calls.some(([method]) => String(method).startsWith("Input."))).toBe(false);
    expect(ctx.manager.getActiveTab()?.webContents.focus).not.toHaveBeenCalled();
  });

  it("falls back to jpeg for oversized full-page screenshots", async () => {
    let screenshots = 0;
    const send = vi.fn<(method: string, params?: Record<string, unknown>) => Promise<unknown>>(
      async (method) => {
        if (method === "Page.getLayoutMetrics") {
          return { cssContentSize: { x: 0, y: 0, width: 800, height: 600 } };
        }
        if (method === "Page.captureScreenshot") {
          screenshots++;
          return {
            data: Buffer.alloc(screenshots === 1 ? 3000 : 20).toString("base64"),
          };
        }
        if (method === "Runtime.evaluate") {
          return { result: { type: "boolean", value: true } };
        }
        return {};
      },
    );
    const ctx = createDispatchContext(send);

    await expect(
      dispatchTool("screenshot", { fullPage: true, maxBytes: 2000 }, ctx),
    ).resolves.toMatchObject({
      mimeType: "image/jpeg",
      format: "jpeg",
      fallback: true,
    });
    expect(screenshots).toBeGreaterThan(1);
  });

  it("returns structured timeout metadata for a stuck viewport screenshot capture", async () => {
    vi.useFakeTimers();
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);
    const tab = ctx.manager.getActiveTab() as unknown as {
      webContents: {
        capturePage: ReturnType<typeof vi.fn>;
      };
    };
    tab.webContents.capturePage.mockReturnValueOnce(new Promise(() => {}));

    try {
      const result = dispatchTool("screenshot", { timeoutMs: 200 }, ctx);
      await vi.advanceTimersByTimeAsync(200);
      await expect(result).resolves.toMatchObject({
        timedOut: true,
        reason: "timeout",
        operation: "viewport screenshot",
        timeoutMs: 200,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("can hard-fail on screenshot timeout", async () => {
    vi.useFakeTimers();
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);
    const tab = ctx.manager.getActiveTab() as unknown as {
      webContents: {
        capturePage: ReturnType<typeof vi.fn>;
      };
    };
    tab.webContents.capturePage.mockReturnValueOnce(new Promise(() => {}));

    try {
      const result = dispatchTool("screenshot", { timeoutMs: 200, failOnTimeout: true }, ctx);
      const rejection = result.catch((cause: unknown) => cause);
      await vi.advanceTimersByTimeAsync(200);
      const error = await rejection;
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty("message", "viewport screenshot timed out after 200ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes screenshot metadata next to image content", async () => {
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);
    const raw = await dispatchTool("screenshot", {}, ctx);
    const formatted = formatToolResult("screenshot", raw);

    expect(formatted.content[0]?.type).toBe("text");
    expect(formatted.content[0]?.text).toContain('"timedOut": false');
    expect(formatted.content[1]?.type).toBe("image");
  });

  it("passes compact snapshot options through to the page snapshot", async () => {
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);

    await dispatchTool("snapshot", { mode: "compact", maxTextLength: 40 }, ctx);

    expect(
      send.mock.calls.some(
        ([method, params]) =>
          method === "Runtime.evaluate" &&
          String(params?.expression).includes('const mode = "compact"') &&
          String(params?.expression).includes("const maxTextLength = 40"),
      ),
    ).toBe(true);
  });

  it("passes ranked find options through to accessibility search", async () => {
    const send = createRoutingSend();
    const ctx = createDispatchContext(send);

    await dispatchTool(
      "find",
      { text: "Submit", limit: 3, visibleOnly: false, interactiveOnly: true, within: "form" },
      ctx,
    );

    expect(
      send.mock.calls.some(
        ([method, params]) =>
          method === "Runtime.evaluate" &&
          String(params?.expression).includes('"limit":3') &&
          String(params?.expression).includes('"visibleOnly":false') &&
          String(params?.expression).includes('"interactiveOnly":true') &&
          String(params?.expression).includes('"within":"form"'),
      ),
    ).toBe(true);
  });
});
