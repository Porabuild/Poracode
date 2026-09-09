import { once } from "node:events";
import { afterEach, expect, it } from "vitest";
import { WebSocket } from "ws";
import { runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import { RemoteAccessServer, type RemoteAccessServerInfo } from "./RemoteAccessServer";
import type { RemoteBroadcastEvent } from "./server/context";

let server: RemoteAccessServer | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await server?.dispose();
  server = undefined;
});

function runtimeResult(index: number, content: string): RemoteBroadcastEvent {
  return {
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: runtimeEventSchema.parse({
      type: "item.completed",
      threadId: "thread-1",
      itemId: `item-${index}`,
      payload: { name: "command", result: content },
    }),
  };
}

async function authorize(info: RemoteAccessServerInfo): Promise<string> {
  const url = new URL(info.pairingUrl);
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential: new URLSearchParams(url.hash.slice(1)).get("token"),
      scopes: ["session:read"],
    }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

it.each([true, false])(
  "delivers a large replay and live events with compression=%s",
  async (compression) => {
    server = new RemoteAccessServer({
      truncateThreadRuntime: () => {},
      appVersion: "test",
      identity: { desktopId: "replay-test", label: "Replay test" },
      host: "127.0.0.1",
      port: 0,
      ownsSupervisorPersistence: false,
      webSocketHeartbeatIntervalMs: 0,
      callSupervisor: async () => {
        throw new Error("Unexpected supervisor call");
      },
    });
    const info = await server.start();
    const token = await authorize(info);
    const content = "漢字🌐".repeat(80_000);
    const expected = Array.from({ length: 7 }, (_, index) => runtimeResult(index, content));
    for (const event of expected) server.publishSupervisorEvent(event);
    const ticketResponse = await fetch(new URL("/api/auth/websocket-ticket", info.httpBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ticketResponse.status).toBe(200);
    const { ticket } = (await ticketResponse.json()) as { ticket: string };
    const url = new URL("/ws", info.wsBaseUrl);
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("lastSeenSeq", "0");
    const socket = new WebSocket(url, { perMessageDeflate: compression });
    sockets.push(socket);
    const events: Array<{ seq: number; event: RemoteBroadcastEvent }> = [];
    const otherMessages: string[] = [];
    const errors: Error[] = [];
    let receivedBytes = 0;
    socket.on("error", (error) => errors.push(error));
    socket.on("message", (raw) => {
      receivedBytes += Buffer.byteLength(raw.toString());
      const message = JSON.parse(raw.toString()) as {
        type: string;
        seq: number;
        event: RemoteBroadcastEvent;
      };
      if (message.type !== "event") {
        otherMessages.push(message.type);
        return;
      }
      events.push(message);
      if (events.length === 1) {
        const live = runtimeResult(7, "live-after-reconnect");
        expected.push(live);
        server!.publishSupervisorEvent(live);
      }
    });
    await once(socket, "open");
    await expect.poll(() => events.length, { timeout: 5_000 }).toBe(8);
    expect(events.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(events.map((entry) => entry.event)).toEqual(expected);
    expect(otherMessages).toEqual(["ready"]);
    expect(receivedBytes).toBeGreaterThan(4 * 1024 * 1024);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(errors).toEqual([]);
  },
);
