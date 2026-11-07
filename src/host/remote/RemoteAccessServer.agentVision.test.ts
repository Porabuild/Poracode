import { afterEach, describe, expect, it, vi } from "vitest";
import { dbGetThread } from "@/host/db";
import { AgentVisionService } from "../AgentVisionService";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "./RemoteAccessServer";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { WebSocket } from "ws";
import { agentVisionSchema } from "@/shared/agentVision";
import { remoteWebSocketClientMessageSchema } from "@/shared/remote/protocol/wire";

vi.mock("@/host/db", () => ({
  dbGetThread: vi.fn<(id: string) => { id: string; status: string } | null>((id) =>
    id === "thread-a" ? { id, status: "working" } : null,
  ),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbGetProject: vi.fn<() => null>(() => null),
  dbGetState: vi.fn<() => null>(() => null),
  dbSetState: vi.fn<() => void>(),
}));

let server: RemoteAccessServer | undefined;
afterEach(async () => {
  await server?.dispose();
  server = undefined;
});

async function fixture(withVision = true) {
  const service = new AgentVisionService();
  const capture = vi.fn<() => Promise<{ image: string }>>(async () => ({
    image: "data:image/jpeg;base64,aGVsbG8=",
  }));
  service.begin("thread-a", "browser", "click").finish({ capture });
  server = new RemoteAccessServer({
    truncateThreadRuntime: () => {},
    appVersion: "1.0.0",
    identity: { desktopId: "vision-host", label: "Vision host" },
    host: "127.0.0.1",
    port: 0,
    tls: null,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
      async () => undefined as never,
    ),
    ...(withVision
      ? {
          readAgentVision: (threadId: string, preview: boolean, streaming?: boolean) =>
            service.read(threadId, preview, streaming),
        }
      : {}),
  });
  const info = await server.start();
  const pairing = server.issueIndependentPairingUrl("Vision viewer", { preset: "viewer" });
  const credential = new URLSearchParams(new URL(pairing).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      client: { label: "Vision viewer", deviceType: "browser" },
    }),
  });
  expect(response.status).toBe(200);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return {
    service,
    capture,
    client: new RemoteDesktopClient(info.httpBaseUrl, accessToken),
    endpoint: info.httpBaseUrl,
    accessToken,
  };
}

describe("authenticated Agent Vision reads", () => {
  it("accepts pre-stream snapshots and rejects unsupported stream versions", () => {
    expect(
      agentVisionSchema.parse({
        version: 1,
        source: "browser",
        toolName: "click",
        status: "idle",
        updatedAt: 1,
      }),
    ).not.toHaveProperty("streamVersion");
    expect(
      remoteWebSocketClientMessageSchema.safeParse({
        type: "agent-vision-watch",
        version: 2,
        watchId: "w",
        threadId: "thread-a",
      }).success,
    ).toBe(false);
  });

  it("streams only after opt-in, stops on unwatch and disconnect, and rejects unknown threads", async () => {
    const { client, capture } = await fixture();
    const socket = new WebSocket(client.websocketUrl(await client.websocketTicket(), null));
    const frames: Array<{ type: string; watchId: string; vision: unknown }> = [];
    socket.on("message", (data) => {
      frames.push(JSON.parse(data.toString()));
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 90));
      expect(capture).not.toHaveBeenCalled();
      socket.send(
        JSON.stringify({
          type: "agent-vision-watch",
          version: 1,
          threadId: "unknown",
          watchId: "unknown",
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 90));
      expect(capture).not.toHaveBeenCalled();
      socket.send(
        JSON.stringify({
          type: "agent-vision-watch",
          version: 1,
          threadId: "thread-a",
          watchId: "live",
        }),
      );
      await vi.waitFor(() =>
        expect(
          frames.some((frame) => frame.type === "agent-vision-frame" && frame.watchId === "live"),
        ).toBe(true),
      );
      await vi.waitFor(() => expect(capture.mock.calls.length).toBeGreaterThan(1));
      socket.send(JSON.stringify({ type: "agent-vision-unwatch", watchId: "live" }));
      await new Promise((resolve) => setTimeout(resolve, 90));
      const stopped = capture.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(capture).toHaveBeenCalledTimes(stopped);
      socket.send(
        JSON.stringify({
          type: "agent-vision-watch",
          version: 1,
          threadId: "thread-a",
          watchId: "again",
        }),
      );
      await vi.waitFor(() => expect(capture.mock.calls.length).toBeGreaterThan(stopped));
      socket.close();
      await new Promise<void>((resolve) => socket.once("close", resolve));
      const disconnected = capture.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(capture).toHaveBeenCalledTimes(disconnected);
    } finally {
      socket.terminate();
    }
  });
  it("serves reconnecting viewers, suppresses collapsed images, and requires an existing authorized thread", async () => {
    const { client, capture, endpoint, accessToken } = await fixture();
    expect(await client.agentVision("thread-a", false)).toMatchObject({ toolName: "click" });
    expect(capture).not.toHaveBeenCalled();
    expect(await client.agentVision("thread-a")).toHaveProperty("image");
    expect(await client.agentVision("thread-a", false)).not.toHaveProperty("image");
    const reconnect = new RemoteDesktopClient(endpoint, accessToken);
    expect(await reconnect.agentVision("thread-a")).toHaveProperty("image");
    const path = new URL("/api/threads/thread-a/agent-vision", endpoint);
    expect((await fetch(path)).status).toBe(401);
    const response = await fetch(path, { headers: { authorization: `Bearer ${accessToken}` } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(vi.mocked(dbGetThread)).toHaveBeenCalledWith("thread-a");
    await expect(client.agentVision("unknown")).rejects.toMatchObject({ status: 404 });
  });

  it("keeps hosts without the new service compatible", async () => {
    const { client, capture } = await fixture(false);
    expect(await client.agentVision("thread-a")).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
});
