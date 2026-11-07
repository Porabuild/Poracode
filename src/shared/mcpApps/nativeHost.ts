import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { McpAppReference, ControlMcpAppResult } from "../contracts/mcpApps";
import { mountMcpApp } from "./viewBridge";

interface NativeConfiguration {
  app: McpAppReference;
  threadId: string;
  input: Record<string, unknown>;
  result: CallToolResult;
  context: McpUiHostContext;
}

interface NativeWindow extends Window {
  webkit?: { messageHandlers: { poracodeMcpApp: { postMessage(message: unknown): void } } };
  poracodeMcpAppNative?: { postMessage(message: string): void };
  PoracodeMcpApp?: {
    start(configuration: NativeConfiguration): Promise<void>;
    respond(id: string, result: unknown, error?: string): void;
    setContext(context: McpUiHostContext): void;
    close(): void;
  };
}

const nativeWindow = window as NativeWindow;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
let controller: AbortController | undefined;
let view: Awaited<ReturnType<typeof mountMcpApp>> | undefined;
let nativePort: MessagePort | undefined;

function post(message: unknown): void {
  if (nativeWindow.webkit) nativeWindow.webkit.messageHandlers.poracodeMcpApp.postMessage(message);
  else nativePort?.postMessage(JSON.stringify(message));
}

function request(operation: string, payload: unknown): Promise<unknown> {
  if (pending.size >= 16) return Promise.reject(new Error("MCP App request limit reached."));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({ id, operation, payload });
  });
}

nativeWindow.PoracodeMcpApp = {
  async start(configuration) {
    this.close();
    const owner = new AbortController();
    controller = owner;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.style.cssText = "width:100%;height:100%;border:0;display:block";
    document.body.replaceChildren(frame);
    document.body.style.cssText = "margin:0;overflow:hidden";
    try {
      const mounted = await mountMcpApp({
        ...configuration,
        frame,
        endpoint: "http://localhost",
        signal: owner.signal,
        inlineSandbox: true,
        host: {
          appVersion: "1",
          controlMcpApp: async (payload) =>
            (await request("control", payload)) as ControlMcpAppResult,
          openLink: async (url) => {
            await request("openLink", { url });
          },
          sendMessage: async (text) => {
            await request("sendMessage", { text });
          },
        },
        onReady: () => {
          if (!owner.signal.aborted) post({ operation: "ready" });
        },
        onHeight: (height) => {
          if (!owner.signal.aborted) post({ operation: "height", height });
        },
        onUnavailable: () => {
          if (!owner.signal.aborted) {
            post({ operation: "unavailable" });
            owner.abort();
          }
        },
      });
      if (!owner.signal.aborted) view = mounted;
    } catch {
      if (!owner.signal.aborted) {
        post({ operation: "unavailable" });
        owner.abort();
      }
    }
  },
  respond(id, result, error) {
    const waiting = pending.get(id);
    if (!waiting) return;
    pending.delete(id);
    if (error) waiting.reject(new Error(error));
    else waiting.resolve(result);
  },
  setContext(context) {
    view?.setHostContext(context);
  },
  close() {
    controller?.abort();
    view = undefined;
    for (const waiting of pending.values()) waiting.reject(new Error("MCP App view closed."));
    pending.clear();
  },
};

// Android transfers this port only to the credential-free trusted main frame.
// A child window cannot impersonate the native sender (its source is non-null).
window.addEventListener("message", (event) => {
  if (
    event.source !== null ||
    event.data !== "poracode-mcp-app-port-v1" ||
    event.ports.length !== 1 ||
    nativePort
  )
    return;
  nativePort = event.ports[0]!;
  nativePort.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data);
      if (data.operation === "start") void nativeWindow.PoracodeMcpApp!.start(data.configuration);
      else if (data.operation === "response")
        nativeWindow.PoracodeMcpApp!.respond(data.id, data.result, data.error);
      else if (data.operation === "context") nativeWindow.PoracodeMcpApp!.setContext(data.context);
      else if (data.operation === "close") nativeWindow.PoracodeMcpApp!.close();
    } catch {
      post({ operation: "unavailable" });
    }
  };
  post({ operation: "boot" });
});

post({ operation: "boot" });
