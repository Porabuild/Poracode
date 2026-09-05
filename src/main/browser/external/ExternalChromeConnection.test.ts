import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { ExternalChromeConnection } from "./ExternalChromeConnection";
import { dispatchChromeTool } from "./chromeTools";

/** Minimal stand-in for a `ws` socket that records outbound frames and lets the
 *  test emit inbound ones. */
class FakeWs {
  readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly sent: Array<Record<string, unknown>> = [];

  on(event: string, cb: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }
  off(): this {
    return this;
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.emit("close");
  }
  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args);
  }
  inbound(msg: unknown): void {
    this.emit("message", JSON.stringify(msg));
  }
  last(): Record<string, unknown> {
    return this.sent[this.sent.length - 1]!;
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeConn(): { conn: ExternalChromeConnection; ws: FakeWs; onClosed: () => void } {
  const ws = new FakeWs();
  const onClosed = vi.fn<() => void>();
  const conn = new ExternalChromeConnection(
    ws as unknown as WebSocket,
    { extensionVersion: "9.9.9" },
    onClosed,
  );
  return { conn, ws, onClosed };
}

describe("ExternalChromeConnection", () => {
  it.each([
    ["switch", "click"],
    ["switch", "press"],
    ["detach", "click"],
    ["detach", "press"],
  ])("stops batch %s before %s and observation can reach another tab", async (change, action) => {
    const { conn, ws } = makeConn();
    const attach = conn.attach(42);
    ws.inbound({
      id: ws.last().id,
      type: "result",
      ok: true,
      tab: { tabId: 42, url: "https://a" },
    });
    await attach;
    const batch = dispatchChromeTool(
      "perform",
      {
        steps: [
          { action: "wait", ms: 30 },
          action === "press" ? { action, key: "Enter" } : { action, selector: "#submit" },
        ],
      },
      { connection: conn, allowEval: false, allowDataAccess: false },
    );
    await flush();
    if (change === "switch") {
      const next = conn.attach(43);
      ws.inbound({
        id: ws.last().id,
        type: "result",
        ok: true,
        tab: { tabId: 43, url: "https://b" },
      });
      await next;
    } else {
      ws.inbound({ type: "detached", tabId: 42, reason: "canceled_by_user" });
    }
    const sentBeforeContinuation = ws.sent.length;
    await expect(batch).resolves.toMatchObject({
      ok: false,
      failedIndex: 1,
      error: expect.stringContaining("attachment changed"),
      observationError: expect.stringContaining("attachment changed"),
      steps: [{ index: 0 }],
    });
    expect(ws.sent).toHaveLength(sentBeforeContinuation);
    conn.dispose();
  });

  it("sends pinned commands only to the selected tab without reopening a workspace", async () => {
    const { conn, ws } = makeConn();
    const attach = conn.attach(42);
    ws.inbound({
      id: ws.last().id,
      type: "result",
      ok: true,
      tab: { tabId: 42, url: "https://a" },
    });
    await attach;
    const request = conn.cdpSession(42).send("Runtime.evaluate", { expression: "1" });
    expect(ws.last()).toMatchObject({ type: "cdp", tabId: 42, method: "Runtime.evaluate" });
    ws.inbound({ id: ws.last().id, type: "result", ok: true, result: 1 });
    await expect(request).resolves.toBe(1);
    conn.dispose();
  });
  it("correlates a request with its result by id", async () => {
    const { conn, ws } = makeConn();
    const promise = conn.listTabs();
    const req = ws.last();
    expect(req.type).toBe("listTabs");
    expect(typeof req.id).toBe("number");

    ws.inbound({ id: req.id, type: "result", ok: true, tabs: [{ tabId: 7, url: "https://x" }] });
    await expect(promise).resolves.toEqual([{ tabId: 7, url: "https://x" }]);
  });

  it("opens a background workspace tab before the first CDP command", async () => {
    const { conn, ws } = makeConn();
    const promise = conn.sendCdp("Runtime.evaluate", { expression: "1" });

    // First frame opens a background Poracode-group tab (no focus steal).
    const openReq = ws.last();
    expect(openReq.type).toBe("openTab");
    ws.inbound({
      id: openReq.id,
      type: "result",
      ok: true,
      tab: { tabId: 42, url: "https://a" },
    });
    await flush();

    // Now the CDP command goes out targeted at the attached tab.
    const cdpReq = ws.last();
    expect(cdpReq).toMatchObject({ type: "cdp", tabId: 42, method: "Runtime.evaluate" });
    ws.inbound({ id: cdpReq.id, type: "result", ok: true, result: { value: 1 } });

    await expect(promise).resolves.toEqual({ value: 1 });
    expect(conn.isAttached()).toBe(true);
  });

  it("rejects when the extension returns ok:false", async () => {
    const { conn, ws } = makeConn();
    const promise = conn.attach(3);
    const req = ws.last();
    ws.inbound({ id: req.id, type: "result", ok: false, error: "tab 3 not found" });
    await expect(promise).rejects.toThrow("tab 3 not found");
  });

  it("fans CDP events out to method subscribers", () => {
    const { conn, ws } = makeConn();
    const seen: unknown[] = [];
    conn.onCdpEvent("Page.frameNavigated", (params) => seen.push(params));
    ws.inbound({ type: "cdpEvent", method: "Page.frameNavigated", params: { frameId: "f1" } });
    ws.inbound({ type: "cdpEvent", method: "Network.responseReceived", params: {} });
    expect(seen).toEqual([{ frameId: "f1" }]);
  });

  it("drops the attachment when the tab detaches (banner dismissed)", async () => {
    const { conn, ws } = makeConn();
    const p = conn.attach(5);
    ws.inbound({ id: ws.last().id, type: "result", ok: true, tab: { tabId: 5, url: "https://b" } });
    await p;
    expect(conn.isAttached()).toBe(true);

    ws.inbound({ type: "detached", tabId: 5, reason: "canceled_by_user" });
    expect(conn.isAttached()).toBe(false);
  });

  it("detaches the current tab when an MCP session ends", async () => {
    const { conn, ws } = makeConn();
    const attach = conn.attach(5);
    ws.inbound({ id: ws.last().id, type: "result", ok: true, tab: { tabId: 5, url: "https://b" } });
    await attach;

    const detach = conn.detach();
    const req = ws.last();
    expect(req).toMatchObject({ type: "detach", tabId: 5 });
    ws.inbound({ id: req.id, type: "result", ok: true });
    await detach;

    expect(conn.isAttached()).toBe(false);
  });

  it("ignores events from a stale attached tab", async () => {
    const { conn, ws } = makeConn();
    const seen: unknown[] = [];
    conn.onCdpEvent("Page.frameNavigated", (params) => seen.push(params));

    const first = conn.attach(5);
    ws.inbound({ id: ws.last().id, type: "result", ok: true, tab: { tabId: 5, url: "https://a" } });
    await first;

    const second = conn.attach(6);
    ws.inbound({ id: ws.last().id, type: "result", ok: true, tab: { tabId: 6, url: "https://b" } });
    await second;

    ws.inbound({
      type: "cdpEvent",
      tabId: 5,
      method: "Page.frameNavigated",
      params: { old: true },
    });
    ws.inbound({ type: "detached", tabId: 5, reason: "target_closed" });
    expect(conn.isAttached()).toBe(true);

    ws.inbound({
      type: "cdpEvent",
      tabId: 6,
      method: "Page.frameNavigated",
      params: { current: true },
    });
    expect(seen).toEqual([{ current: true }]);
  });

  it("rejects in-flight requests and notifies on dispose", async () => {
    const { conn, ws, onClosed } = makeConn();
    const pending = conn.listTabs();
    conn.dispose();
    await expect(pending).rejects.toThrow(/closed/i);
    expect(onClosed).toHaveBeenCalledOnce();
    void ws;
  });

  it("exposes a CdpSession that routes send() through the connection", async () => {
    const { conn, ws } = makeConn();
    const cdp = conn.cdpSession();
    const promise = cdp.send("Page.reload");
    const attachReq = ws.last();
    ws.inbound({ id: attachReq.id, type: "result", ok: true, tab: { tabId: 1, url: "x" } });
    await flush();
    const cdpReq = ws.last();
    expect(cdpReq).toMatchObject({ type: "cdp", method: "Page.reload", tabId: 1 });
    ws.inbound({ id: cdpReq.id, type: "result", ok: true, result: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });
  });
});
