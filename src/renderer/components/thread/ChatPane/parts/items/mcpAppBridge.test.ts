import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { McpAppFrameTransport, mountMcpApp } from "@/shared/mcpApps/viewBridge";
import type { ControlMcpAppPayload, ControlMcpAppResult } from "@/shared/contracts/mcpApps";

const app = {
  version: 1 as const,
  sessionId: "b4325167-a276-420f-bd51-a46d8e4bfa39",
  toolName: "deployment",
  resourceUri: "ui://fixture/deployment",
};
const owners: AbortController[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.abort();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function frameFixture() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const posted = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => undefined);
  const emit = (
    data: unknown,
    source: MessageEventSource | null = frame.contentWindow,
    origin = "null",
  ) => window.dispatchEvent(new MessageEvent("message", { data, source, origin }));
  return { frame, posted, emit };
}

async function mounted() {
  const fixture = frameFixture();
  const owner = new AbortController();
  owners.push(owner);
  const host = {
    appVersion: "test",
    controlMcpApp: vi.fn<(payload: ControlMcpAppPayload) => Promise<ControlMcpAppResult>>(
      async (payload) => ({
        result:
          payload.action.type === "readResource"
            ? {
                contents: [
                  {
                    uri: app.resourceUri,
                    mimeType: "text/html;profile=mcp-app",
                    text: "<button>Refresh</button>",
                  },
                ],
              }
            : payload.action.type === "listTools"
              ? { tools: [] }
              : { content: [], structuredContent: { status: "READY" } },
      }),
    ),
    openLink: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    sendMessage: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
  };
  const onReady = vi.fn<() => void>();
  const onHeight = vi.fn<(height: number) => void>();
  const bridge = await mountMcpApp({
    ...fixture,
    endpoint: "http://localhost:4400",
    threadId: "thread-one",
    app,
    input: { id: "deployment-1" },
    result: { content: [], structuredContent: { status: "BUILDING" } },
    context: { theme: "dark" },
    signal: owner.signal,
    host,
    onReady,
    onHeight,
    onUnavailable: vi.fn<() => void>(),
  });
  fixture.posted.mockRestore();
  fixture.posted = vi
    .spyOn(fixture.frame.contentWindow!, "postMessage")
    .mockImplementation(() => undefined);
  fixture.emit({ jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready" });
  const request = async (id: number, method: string, params: unknown) => {
    fixture.emit({ jsonrpc: "2.0", id, method, params });
    await waitFor(() =>
      expect(
        fixture.posted.mock.calls.some(([message]) => (message as { id?: number }).id === id),
      ).toBe(true),
    );
    return fixture.posted.mock.calls
      .map(([message]) => message as Record<string, unknown>)
      .find((message) => message.id === id)!;
  };
  const init = await request(1, "ui/initialize", {
    protocolVersion: "2026-01-26",
    appInfo: { name: "fixture", version: "1" },
    appCapabilities: {},
  });
  fixture.emit({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
  await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
  return { ...fixture, owner, bridge, host, request, init, onHeight };
}

describe("MCP App bridge", () => {
  it("accepts only its exact opaque proxy and one sandbox handshake", async () => {
    const { frame, emit, posted } = frameFixture();
    const transport = new McpAppFrameTransport(frame, "<script>app()</script>");
    const message = vi.fn<(value: unknown) => void>();
    transport.onmessage = message;
    await transport.start();
    const ready = { jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready" };
    emit(ready, window);
    emit(ready, frame.contentWindow, "https://host.test");
    expect(posted).not.toHaveBeenCalled();
    emit(ready);
    emit(ready);
    expect(posted).toHaveBeenCalledOnce();
    emit({ jsonrpc: "2.0", method: "ping", id: 2 });
    expect(message).toHaveBeenCalledOnce();
    emit({ method: "tools/call", id: 3 });
    emit({ jsonrpc: "2.0", method: "ui/notifications/sandbox-resource-ready" });
    expect(message).toHaveBeenCalledOnce();
    await transport.close();
    emit({ jsonrpc: "2.0", method: "ping", id: 4 });
    expect(message).toHaveBeenCalledOnce();
  });

  it("negotiates the stable protocol before delivering input/result and proxies app operations", async () => {
    const { frame, posted, host, request, init, bridge, onHeight, emit } = await mounted();
    expect(frame.src).toContain("/mcp-apps/sandbox/v1");
    expect(init.result).toMatchObject({
      protocolVersion: "2026-01-26",
      hostContext: { theme: "dark" },
    });
    expect(
      posted.mock.calls.map(([message]) => (message as { method?: string }).method).filter(Boolean),
    ).toEqual([
      "ui/notifications/sandbox-resource-ready",
      "ui/notifications/tool-input",
      "ui/notifications/tool-result",
    ]);
    expect(
      await request(2, "tools/call", { name: "refresh", arguments: { id: "deployment-1" } }),
    ).toMatchObject({ result: { structuredContent: { status: "READY" } } });
    expect(host.controlMcpApp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadId: "thread-one",
        app,
        action: { type: "callTool", name: "refresh", arguments: { id: "deployment-1" } },
      }),
    );
    expect(await request(3, "resources/read", { uri: "ui://other" })).toHaveProperty("error");
    await request(4, "ui/update-model-context", { structuredContent: { status: "READY" } });
    expect(host.controlMcpApp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: { type: "updateModelContext", structuredContent: { status: "READY" } },
      }),
    );
    await request(5, "ui/message", {
      role: "user",
      content: [{ type: "text", text: "Debug build logs" }],
    });
    expect(host.sendMessage).toHaveBeenCalledWith("Debug build logs");
    emit({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 9000 } });
    await waitFor(() => expect(onHeight).toHaveBeenLastCalledWith(1200));
    bridge.setHostContext({ theme: "light" });
    await waitFor(() =>
      expect(posted).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "ui/notifications/host-context-changed",
          params: { theme: "light" },
        }),
        "*",
      ),
    );
  });

  it("opens Visit links only through the host and refuses executable or credential-bearing URLs", async () => {
    const { request, host } = await mounted();
    let id = 10;
    for (const url of [
      "javascript:alert(1)",
      "file:///C:/secret",
      "https://user:secret@example.com/",
    ])
      expect(await request(id++, "ui/open-link", { url })).toHaveProperty("error");
    expect(host.openLink).not.toHaveBeenCalled();
    await request(id, "ui/open-link", { url: "https://example.com/deployment" });
    expect(host.openLink).toHaveBeenCalledWith("https://example.com/deployment");
  });
});
