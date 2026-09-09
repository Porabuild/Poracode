import { once } from "node:events";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { ForwardOriginPolicy } from "@/main/remote/portForward/forwardOrigin";
import {
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayServerFrameSchema,
} from "@/shared/remote/relayProtocol";
import { RelayServer } from "./relayServer";

const cleanup: Array<() => Promise<void>> = [];
const policy = new ForwardOriginPolicy("https://apps.example.test");
const forwardId = "01234567-89ab-4cde-8f01-23456789abcd";

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function startRelay(now = () => Date.now()) {
  const relay = new RelayServer(
    { host: "127.0.0.1", port: 0, forwardBaseUrl: policy.baseUrl, secretBindingTtlMs: 1 },
    now,
  );
  const info = await relay.start();
  cleanup.push(() => relay.dispose());
  return info.url;
}

async function register(
  base: string,
  serverId: string,
  seed: number,
  secret = "registration secret",
) {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/host`);
  cleanup.push(async () => socket.terminate());
  await once(socket, "open");
  const registered = once(socket, "message");
  socket.send(
    JSON.stringify({
      t: "register",
      protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
      serverId,
      secret,
      originSecret: Buffer.alloc(32, seed).toString("base64url"),
    }),
  );
  const [raw] = await registered;
  const frame = relayServerFrameSchema.parse(JSON.parse(String(raw)));
  if (frame.t !== "registered" || !frame.forwardOrigin)
    throw new Error("Expected isolated origin registration.");
  socket.on("message", (message) => {
    const incoming = relayServerFrameSchema.parse(JSON.parse(String(message)));
    if (incoming.t === "req") {
      socket.send(
        JSON.stringify({
          t: "res",
          id: incoming.id,
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from(
            JSON.stringify({ serverId, path: incoming.path, forward: incoming.forward }),
          ).toString("base64"),
        }),
      );
    } else if (incoming.t === "ws-open") {
      socket.send(
        JSON.stringify({
          t: "ws-data",
          id: incoming.id,
          data: JSON.stringify({ serverId, path: incoming.path, forward: incoming.forward }),
        }),
      );
    }
  });
  return { socket, origin: policy.originFor(frame.forwardOrigin.ownerId, forwardId) };
}

async function get(base: string, host: string, path: string, cookie = "") {
  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(`${base}${path}`, { headers: { host, cookie } }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => resolve({ status: res.statusCode!, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

describe("relay forward origin dispatch", () => {
  it("keeps old forward hostnames out of API/control routes when ingress is unconfigured", async () => {
    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const info = await relay.start();
    cleanup.push(() => relay.dispose());
    const oldHost = new URL(policy.originFor("a".repeat(24), forwardId)).host;
    expect((await get(info.url, oldHost, "/healthz")).status).toBe(404);
    expect((await get(info.url, oldHost, "/s/host-a/api/data")).status).toBe(404);
    const socket = new WebSocket(`${info.url.replace(/^http/, "ws")}/host`, {
      headers: { host: oldHost },
    });
    cleanup.push(async () => socket.terminate());
    await expect(once(socket, "open")).rejects.toThrow("socket hang up");
  });

  it("reports malformed API origin configuration with its configuration name", () => {
    expect(
      () => new RelayServer({ publicBaseUrl: "not a URL", forwardBaseUrl: policy.baseUrl }),
    ).toThrow("PORACODE_RELAY_PUBLIC_BASE_URL");
  });

  it("requires the explicit API prefix instead of a legacy routing cookie", async () => {
    const base = await startRelay();
    await register(base, "host-a", 1);
    const host = new URL(base).host;
    expect((await get(base, host, "/api/data", "lc_relay=host-a")).status).toBe(404);
    const response = await get(base, host, "/s/host-a/api/data", "lc_relay=host-b");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ serverId: "host-a", path: "/api/data" });
  });

  it("routes by authenticated owner even when paths and cookies point elsewhere", async () => {
    const base = await startRelay();
    const a = await register(base, "host-a", 1);
    await register(base, "host-b", 2);
    for (const path of ["/api/data", "/s/host-b/api/data", "/healthz"]) {
      const response = await get(base, new URL(a.origin).host, path, "lc_relay=host-b");
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        serverId: "host-a",
        path,
        forward: { forwardId, origin: a.origin },
      });
    }
  });

  it("keeps child /host upgrades on the forwarding path and rejects foreign browser origins", async () => {
    const base = await startRelay();
    const a = await register(base, "host-a", 1);
    const socket = new WebSocket(`${base.replace(/^http/, "ws")}/host`, {
      headers: { host: new URL(a.origin).host, origin: a.origin },
    });
    cleanup.push(async () => socket.terminate());
    const received = once(socket, "message");
    await once(socket, "open");
    expect(JSON.parse(String((await received)[0]))).toEqual({
      serverId: "host-a",
      path: "/host",
      forward: { forwardId, origin: a.origin },
    });
    const foreign = new WebSocket(`${base.replace(/^http/, "ws")}/ws`, {
      headers: { host: new URL(a.origin).host, origin: "https://other.example.test" },
    });
    cleanup.push(async () => foreign.terminate());
    await expect(once(foreign, "open")).rejects.toThrow("socket hang up");
  });

  it("does not transfer old origins when a disconnected server ID is reclaimed", async () => {
    let time = 0;
    const base = await startRelay(() => time);
    const a = await register(base, "host-a", 1);
    const closed = once(a.socket, "close");
    a.socket.close();
    await closed;
    await vi.waitFor(async () =>
      expect((await get(base, new URL(a.origin).host, "/")).status).toBe(404),
    );
    time = 10;
    const b = await register(base, "host-a", 2, "new registration secret");
    expect(b.origin).not.toBe(a.origin);
    expect((await get(base, new URL(a.origin).host, "/s/host-a/api/data")).status).toBe(404);
    expect((await get(base, new URL(b.origin).host, "/")).status).toBe(200);
  });

  it("never falls back to an API route for invalid child authorities", async () => {
    const base = await startRelay();
    const a = await register(base, "host-a", 1);
    for (const host of [
      "unknown.apps.example.test",
      `${new URL(a.origin).host}:80`,
      "apps.example.test",
    ]) {
      expect((await get(base, host, "/s/host-a/api/data", "lc_relay=host-a")).status).toBe(404);
    }
  });

  it("closes old traffic when the same control connection rotates its origin owner", async () => {
    const base = await startRelay();
    const a = await register(base, "host-a", 1);
    const visitor = new WebSocket(`${base.replace(/^http/, "ws")}/ws`, {
      headers: { host: new URL(a.origin).host, origin: a.origin },
    });
    cleanup.push(async () => visitor.terminate());
    const initial = once(visitor, "message");
    await once(visitor, "open");
    await initial;
    let nextOrigin: string | undefined;
    a.socket.on("message", (raw) => {
      const frame = relayServerFrameSchema.parse(JSON.parse(String(raw)));
      if (frame.t === "registered" && frame.forwardOrigin) {
        nextOrigin = policy.originFor(frame.forwardOrigin.ownerId, forwardId);
      }
    });
    a.socket.send(
      JSON.stringify({
        t: "register",
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
        serverId: "host-a",
        secret: "registration secret",
        originSecret: Buffer.alloc(32, 2).toString("base64url"),
      }),
    );
    await vi.waitFor(() => expect(visitor.readyState).toBe(WebSocket.CLOSED));
    expect(nextOrigin).toBeDefined();
    expect(nextOrigin).not.toBe(a.origin);
    expect((await get(base, new URL(a.origin).host, "/")).status).toBe(404);
    expect((await get(base, new URL(nextOrigin!).host, "/")).status).toBe(200);
  });
});
