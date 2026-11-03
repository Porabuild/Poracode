import { AppBridge, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-bridge";
import {
  deserializeMessage,
  type Transport,
  type JSONRPCMessage,
  type CallToolResult,
  type ListToolsResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/client";
import type {
  ControlMcpAppPayload,
  ControlMcpAppResult,
  McpAppReference,
} from "../contracts/mcpApps";
import { readMcpAppResourceContent } from "../mcpAppResources";
import {
  MCP_APP_SANDBOX_PATH,
  MCP_APP_SANDBOX_HTML,
  buildMcpAppCsp,
  readMcpAppCsp,
} from "../mcpAppSandbox";

/** Both opaque origin and the exact proxy window are required for every message. */
export class McpAppFrameTransport implements Transport {
  onmessage: Transport["onmessage"];
  onerror: Transport["onerror"];
  onclose: Transport["onclose"];
  private closed = false;
  private ready = false;

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly html: string,
  ) {}

  private readonly receive = (event: MessageEvent) => {
    if (this.closed || event.source !== this.frame.contentWindow || event.origin !== "null") return;
    try {
      const data = JSON.stringify(event.data);
      if (data.length > 262_144) return;
      const message = deserializeMessage(data);
      if ("method" in message && message.method === "ui/notifications/sandbox-proxy-ready") {
        if (this.ready) return;
        this.ready = true;
        this.frame.contentWindow?.postMessage(
          {
            jsonrpc: "2.0",
            method: "ui/notifications/sandbox-resource-ready",
            params: { html: this.html },
          },
          "*",
        );
      } else if (
        this.ready &&
        !("method" in message && message.method.startsWith("ui/notifications/sandbox-"))
      ) {
        this.onmessage?.(message);
      }
    } catch {
      // Untrusted frames cannot inject malformed JSON-RPC into the SDK bridge.
    }
  };

  async start(): Promise<void> {
    window.addEventListener("message", this.receive);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || !this.ready) throw new Error("MCP App frame is unavailable.");
    // Opaque destinations require '*'; receive still checks source and origin.
    this.frame.contentWindow?.postMessage(message, "*");
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener("message", this.receive);
    this.onclose?.();
  }
}

export interface McpAppViewOptions {
  frame: HTMLIFrameElement;
  endpoint: string;
  threadId: string;
  app: McpAppReference;
  input: Record<string, unknown>;
  result: CallToolResult;
  context: McpUiHostContext;
  signal: AbortSignal;
  host: {
    appVersion: string;
    controlMcpApp(payload: ControlMcpAppPayload): Promise<ControlMcpAppResult>;
    openLink(url: string): Promise<void>;
    sendMessage(text: string): Promise<void>;
  };
  /** Native content views use an ephemeral main frame and opaque nested frames. */
  inlineSandbox?: boolean;
  onReady(): void;
  onHeight(height: number): void;
  onUnavailable(): void;
}

export async function mountMcpApp(options: McpAppViewOptions): Promise<AppBridge> {
  const host = options.host;
  const control = async (action: ControlMcpAppPayload["action"], requestSignal?: AbortSignal) => {
    const signal = requestSignal
      ? AbortSignal.any([options.signal, requestSignal])
      : options.signal;
    signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const request = { threadId: options.threadId, app: options.app, requestId };
    const cancel = () => {
      void host.controlMcpApp({ ...request, action: { type: "cancel" } }).catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const response = await host.controlMcpApp({ ...request, action });
      signal.throwIfAborted();
      return response.result;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  };
  const resourceResult = await control({ type: "readResource" });
  const resource = Array.isArray(resourceResult.contents)
    ? resourceResult.contents
        .map(readMcpAppResourceContent)
        .find((entry) => entry?.uri === options.app.resourceUri)
    : undefined;
  if (!resource) throw new Error("MCP App resource is unavailable.");
  const ui = resource._meta?.ui;
  const csp = readMcpAppCsp(
    ui && typeof ui === "object" ? (ui as Record<string, unknown>).csp : undefined,
  );
  const bridge = new AppBridge(
    null,
    { name: "Poracode", version: host.appVersion },
    {
      openLinks: {},
      serverTools: {},
      serverResources: {},
      message: { text: {} },
      updateModelContext: { text: {}, structuredContent: {} },
      sandbox: { csp, permissions: {} },
    },
    { hostContext: options.context },
  );
  const transport = new McpAppFrameTransport(options.frame, resource.text);
  let initialized = false;
  const timeout = window.setTimeout(() => options.onUnavailable(), 15_000);
  const close = () => {
    clearTimeout(timeout);
    if (initialized)
      void bridge
        .teardownResource({}, { timeout: 500 })
        .catch(() => undefined)
        .finally(() => {
          void bridge.close();
        });
    else void bridge.close();
  };
  options.signal.addEventListener("abort", close, { once: true });
  bridge.oninitialized = () => {
    initialized = true;
    clearTimeout(timeout);
    void bridge
      .sendToolInput({ arguments: options.input })
      .then(() => bridge.sendToolResult(options.result))
      .then(options.onReady)
      .catch(options.onUnavailable);
  };
  bridge.oncalltool = async (params, extra) =>
    (await control(
      {
        type: "callTool",
        name: params.name,
        ...(params.arguments ? { arguments: params.arguments } : {}),
      },
      extra.mcpReq.signal,
    )) as CallToolResult;
  bridge.setRequestHandler(
    "tools/list",
    async (_params, extra) =>
      (await control({ type: "listTools" }, extra.mcpReq.signal)) as ListToolsResult,
  );
  bridge.onreadresource = async (params, extra) => {
    if (params.uri !== options.app.resourceUri) throw new Error("MCP App resource is unavailable.");
    return (await control({ type: "readResource" }, extra.mcpReq.signal)) as ReadResourceResult;
  };
  bridge.onopenlink = async ({ url }) => {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
      throw new Error("MCP App link is unavailable.");
    await host.openLink(target.href);
    return {};
  };
  bridge.onmessage = async ({ content }) => {
    if (content.some((block) => block.type !== "text")) return { isError: true };
    const text = content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
    if (!text.trim() || text.length > 65_536) return { isError: true };
    await host.sendMessage(text);
    return {};
  };
  bridge.onupdatemodelcontext = async ({ content, structuredContent }, extra) => {
    if (content?.some((block) => block.type !== "text"))
      throw new Error("Unsupported MCP App context.");
    await control(
      {
        type: "updateModelContext",
        ...(content ? { content: content.filter((block) => block.type === "text") } : {}),
        ...(structuredContent ? { structuredContent } : {}),
      },
      extra.mcpReq.signal,
    );
    return {};
  };
  bridge.onsizechange = ({ height }) => {
    if (typeof height === "number" && Number.isFinite(height))
      options.onHeight(Math.max(120, Math.min(1200, height)));
  };
  bridge.onrequestdisplaymode = async () => ({ mode: "inline" });
  bridge.onrequestteardown = () => options.onUnavailable();
  bridge.onerror = () => options.onUnavailable();
  try {
    await bridge.connect(transport);
    options.signal.throwIfAborted();
    if (options.inlineSandbox) {
      // Native shells have no host DOM, storage, or credentials. The fixed
      // script remains outside the app frame; a leading meta policy constrains
      // both sandboxed frames before any server-controlled HTML is delivered.
      const policy = buildMcpAppCsp(csp)
        .replace("sandbox allow-scripts; ", "")
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;");
      const proxy = MCP_APP_SANDBOX_HTML.replace(
        "<head>",
        `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
      ).replace(
        "new URLSearchParams(location.hash.slice(1)).get('parent')",
        JSON.stringify(window.location.origin),
      );
      options.frame.srcdoc = proxy;
    } else {
      const url = new URL(MCP_APP_SANDBOX_PATH, options.endpoint);
      url.searchParams.set("csp", JSON.stringify(csp));
      url.hash = new URLSearchParams({ parent: window.location.origin }).toString();
      options.frame.src = url.href;
    }
    return bridge;
  } catch (error) {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", close);
    await bridge.close();
    throw error;
  }
}
