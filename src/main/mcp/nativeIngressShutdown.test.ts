import { setImmediate as nextTurn } from "node:timers/promises";
import { expect, it } from "vitest";
import { BrowserMcpIngress } from "../browser/BrowserMcpIngress";
import type { BrowserPanelManager } from "../browser/BrowserPanelManager";
import { ChromeMcpIngress } from "../browser/external/ChromeMcpIngress";
import type { ExternalChromeConnection } from "../browser/external/ExternalChromeConnection";

it.each(["browser", "chrome"] as const)(
  "%s facade joins an admitted native continuation after its HTTP socket closes",
  async (kind) => {
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    const order: string[] = [];
    const native = async () => {
      entered.resolve();
      await held.promise;
      order.push("native-settled");
      return { tabId: "synthetic-tab" };
    };
    const ingress = kind === "browser" ? new BrowserMcpIngress() : new ChromeMcpIngress();
    if (ingress instanceof BrowserMcpIngress) {
      ingress.setManagerAccessor(() => ({ createTab: native }) as unknown as BrowserPanelManager);
    } else {
      ingress.setConnectionAccessor(
        () => ({ openTab: native, cdpSession: () => ({}) }) as unknown as ExternalChromeConnection,
      );
    }
    let response: Promise<unknown> | undefined;
    let closing: Promise<void> | undefined;
    try {
      const info = await ingress.start();
      response = fetch(`${info.url}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${info.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: kind === "browser" ? "new_tab" : "open", arguments: {} },
        }),
      }).catch(() => undefined);
      await entered.promise;
      closing = Promise.resolve(ingress.dispose()).then(() => {
        order.push("disposed");
      });
      await nextTurn();
      expect(order).toEqual([]);
      held.resolve();
      await closing;
      expect(order).toEqual(["native-settled", "disposed"]);
      expect(ingress.getInfo()).toBeNull();
      await expect(ingress.start()).rejects.toThrow("shutting down");
    } finally {
      held.resolve();
      await Promise.allSettled([response, closing]);
      await ingress.dispose();
    }
  },
);
