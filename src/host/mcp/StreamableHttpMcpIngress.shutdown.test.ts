import { Server } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { StreamableHttpMcpIngress } from "./StreamableHttpMcpIngress";

function makeIngress(
  dispatchTool: () => Promise<unknown> = async () => ({}),
  beforeTool?: () => void,
) {
  return new StreamableHttpMcpIngress({
    bindHost: "127.0.0.1",
    serverInfo: { name: "shutdown-fixture", version: "1" },
    instructions: "Synthetic lifecycle fixture.",
    tools: [
      { name: "fixture", description: "Synthetic operation", inputSchema: { type: "object" } },
    ],
    isKnownToolName: (name) => name === "fixture",
    buildContext: () => ({}),
    dispatchTool,
    ...(beforeTool ? { onBeforeToolCall: beforeTool } : {}),
    formatToolResult: () => ({ content: [{ type: "text", text: "Synthetic result" }] }),
  });
}

it("joins a canceled HTTP tool continuation before disposal completes", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const ingress = makeIngress(async () => {
    entered.resolve();
    await release.promise;
    order.push("effect");
  });
  const cancellation = new AbortController();
  let response: Promise<Response | Error> | undefined;
  let stopping: Promise<void> | undefined;
  try {
    const info = await ingress.start();
    response = fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "fixture" },
      }),
      signal: cancellation.signal,
    }).catch((error: unknown) => error as Error);
    await entered.promise;
    cancellation.abort();
    await response;
    stopping = Promise.resolve(ingress.dispose()).then(() => {
      order.push("disposed");
    });
    await nextTurn();
    expect(order).toEqual([]);
    release.resolve();
    await stopping;
    expect(order).toEqual(["effect", "disposed"]);
    expect(ingress.getInfo()).toBeNull();
  } finally {
    release.resolve();
    cancellation.abort();
    await Promise.allSettled([response, stopping]);
    await ingress.dispose();
  }
});

it("refuses the remaining batch tools once shutdown closes admission", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  const ingress = makeIngress(async () => {
    calls += 1;
    entered.resolve();
    await release.promise;
  });
  let response: Promise<Response | Error> | undefined;
  let stopping: Promise<void> | undefined;
  try {
    const info = await ingress.start();
    response = fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: JSON.stringify(
        [1, 2].map((id) => ({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "fixture" },
        })),
      ),
    }).catch((error: unknown) => error as Error);
    await entered.promise;
    stopping = ingress.dispose();
    release.resolve();
    await stopping;
    expect(calls).toBe(1);
  } finally {
    release.resolve();
    await Promise.allSettled([response, stopping]);
    await ingress.dispose();
  }
});

it("does not dispatch a tool after its pre-call hook initiates shutdown", async () => {
  let calls = 0;
  let stopping: Promise<void> | undefined;
  const ingress = makeIngress(
    async () => {
      calls += 1;
    },
    () => {
      stopping = ingress.dispose();
    },
  );
  try {
    const info = await ingress.start();
    await fetch(`${info.url}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "fixture" },
      }),
    }).catch(() => undefined);
    await stopping;
    expect(calls).toBe(0);
  } finally {
    await ingress.dispose();
  }
});

async function withObservedListeners(operation: () => Promise<void>): Promise<void> {
  // Observe only this fixture's real listeners so the pre-fix orphaned first
  // listener is still explicitly closed when the regression fails.
  const listeners = vi.spyOn(Server.prototype, "listen");
  try {
    await operation();
  } finally {
    const created = new Set(
      listeners.mock.contexts.filter((listener): listener is Server => listener instanceof Server),
    );
    listeners.mockRestore();
    for (const server of created) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

it("owns one listener for concurrent start calls", async () => {
  await withObservedListeners(async () => {
    const ingress = makeIngress();
    const starting = ingress.start();
    const second = ingress.start();
    try {
      const [firstInfo, secondInfo] = await Promise.all([starting, second]);
      expect(secondInfo).toEqual(firstInfo);
      const closing = ingress.dispose();
      await expect(ingress.start()).rejects.toThrow(/shutting down|closed/);
      await closing;
    } finally {
      await Promise.allSettled([starting, second]);
      await ingress.dispose();
    }
  });
});

it("joins a listen already pending when shutdown starts", async () => {
  await withObservedListeners(async () => {
    const ingress = makeIngress();
    const starting = ingress.start();
    void starting.catch(() => undefined);
    try {
      await ingress.dispose();
      await expect(starting).rejects.toThrow(/shutting down|closed/);
      expect(ingress.getInfo()).toBeNull();
    } finally {
      await starting.catch(() => undefined);
      await ingress.dispose();
    }
  });
});
