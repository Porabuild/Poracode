import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/server";
import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server";
import { omitInvalidSchemaPatterns } from "./portableSchemaPatterns";

/**
 * Normalize tools/list without replacing either peer's MCP handshake or
 * capabilities. Unlike the filtering proxy, newly wrapped native connections
 * keep resources, prompts, server requests, notifications and cancellation.
 */
export async function startSchemaProxy(options: {
  upstreamTransport: Transport;
  downstreamTransport: Transport;
  timeoutMs: number;
}): Promise<{ close(): Promise<void> }> {
  const { upstreamTransport: upstream, downstreamTransport: downstream } = options;
  const lists = new Set<string | number>();
  const initializations = new Set<string | number>();
  const queued = new Set<string | number>();
  let initialized = Promise.resolve();
  const ready = Promise.withResolvers<void>();
  const stopped = Promise.withResolvers<void>();
  void ready.promise.catch(() => undefined);
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= Promise.resolve().then(async () => {
      stopped.resolve();
      ready.reject(new Error("MCP schema proxy closed."));
      lists.clear();
      initializations.clear();
      queued.clear();
      await Promise.allSettled([upstream.close(), downstream.close()]);
    });
    return closing;
  };
  for (const transport of [upstream, downstream]) {
    const onclose = transport.onclose;
    const onerror = transport.onerror;
    transport.onclose = () => {
      onclose?.();
      void close();
    };
    transport.onerror = (error) => {
      onerror?.(error);
      void close();
    };
  }
  async function forwardDownstream(message: JSONRPCMessage): Promise<void> {
    if (closing) return;
    const requestId = "method" in message && "id" in message ? message.id : undefined;
    if (requestId !== undefined) queued.add(requestId);
    if ("method" in message && "id" in message) {
      if (message.method === "tools/list") lists.add(message.id);
      if (message.method === "initialize") initializations.add(message.id);
    }
    if ("method" in message && message.method === "notifications/cancelled") {
      const id = message.params?.["requestId"];
      if (typeof id === "string" || typeof id === "number") {
        lists.delete(id);
        initializations.delete(id);
        if (queued.delete(id)) return;
      }
    }
    await ready.promise;
    // A stdio write completes before the HTTP peer accepts initialized. Gate
    // later requests on that acceptance, not on other requests' completion.
    // Responses and cancellation must remain able to pass an active request.
    if (
      "method" in message &&
      message.method !== "initialize" &&
      message.method !== "notifications/cancelled"
    )
      await initialized;
    if (requestId !== undefined && !queued.delete(requestId)) return;
    if (!closing) await upstream.send(message);
  }
  async function forwardUpstream(received: JSONRPCMessage): Promise<void> {
    if (closing) return;
    let message: JSONRPCMessage = received;
    if (
      !("method" in message) &&
      (typeof message.id === "string" || typeof message.id === "number")
    ) {
      const id = message.id;
      if (initializations.delete(id) && "result" in message) {
        const version = message.result["protocolVersion"];
        if (typeof version !== "string" || !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
          void close();
          return;
        }
        upstream.setProtocolVersion?.(version);
        downstream.setProtocolVersion?.(version);
      }
      if (lists.delete(id) && "result" in message && Array.isArray(message.result["tools"])) {
        message = {
          ...message,
          result: {
            ...message.result,
            tools: message.result["tools"].map((tool: unknown) => {
              if (
                !tool ||
                typeof tool !== "object" ||
                Array.isArray(tool) ||
                !("inputSchema" in tool)
              )
                return tool;
              return { ...tool, inputSchema: omitInvalidSchemaPatterns(tool.inputSchema) };
            }),
          },
        };
      }
    }
    await downstream.send(message);
  }
  downstream.onmessage = (message) => {
    if ("method" in message && message.method === "notifications/initialized") {
      initialized = (async () => {
        await ready.promise;
        if (!closing) await upstream.send(message);
      })();
      void initialized.catch(() => close());
      return;
    }
    void forwardDownstream(message).catch(() => close());
  };
  upstream.onmessage = (message) => {
    void forwardUpstream(message).catch(() => close());
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Read downstream first so EOF cancels a slow upstream start. A late start
    // must close again: it may have allocated its resource after the first close.
    const starting = (async () => {
      try {
        await downstream.start();
        if (!closing) await upstream.start();
      } finally {
        if (closing) await Promise.allSettled([upstream.close(), downstream.close()]);
      }
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("MCP server connection timed out")),
        options.timeoutMs,
      );
    });
    await Promise.race([starting, deadline, stopped.promise]);
    if (closing) throw new Error("MCP schema proxy closed during startup.");
    ready.resolve();
    return { close };
  } catch (error) {
    ready.reject(error);
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
