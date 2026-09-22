import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { sweepWebSocketLiveness } from "./wsHeartbeat";

class FakeSocket {
  readyState: number = WebSocket.OPEN;
  terminated = false;

  terminate(): void {
    this.terminated = true;
  }
}

function asWs(socket: FakeSocket): WebSocket {
  return socket as unknown as WebSocket;
}

describe("sweepWebSocketLiveness budgeted ping routing", () => {
  it("routes each live socket's ping through the provided sender and clears liveness", () => {
    const socket = new FakeSocket();
    const sendPing = vi.fn<(ws: WebSocket) => void>();
    const liveness = new Map([[asWs(socket), true]]);

    sweepWebSocketLiveness(new Map([[asWs(socket), {}]]), liveness, sendPing);

    expect(sendPing).toHaveBeenCalledExactlyOnceWith(asWs(socket));
    expect(liveness.get(asWs(socket))).toBe(false);
    expect(socket.terminated).toBe(false);
  });

  it("terminates a socket that missed the previous pong without pinging again", () => {
    const socket = new FakeSocket();
    const sendPing = vi.fn<(ws: WebSocket) => void>();

    sweepWebSocketLiveness(
      new Map([[asWs(socket), {}]]),
      new Map([[asWs(socket), false]]),
      sendPing,
    );

    expect(sendPing).not.toHaveBeenCalled();
    expect(socket.terminated).toBe(true);
  });

  it("terminates a non-OPEN socket without pinging", () => {
    const socket = new FakeSocket();
    socket.readyState = WebSocket.CLOSING;
    const sendPing = vi.fn<(ws: WebSocket) => void>();

    sweepWebSocketLiveness(
      new Map([[asWs(socket), {}]]),
      new Map([[asWs(socket), true]]),
      sendPing,
    );

    expect(sendPing).not.toHaveBeenCalled();
    expect(socket.terminated).toBe(true);
  });

  it("terminates when the budgeted ping sender throws", () => {
    const socket = new FakeSocket();
    const sendPing = vi.fn<(ws: WebSocket) => void>(() => {
      throw new Error("not open");
    });

    sweepWebSocketLiveness(
      new Map([[asWs(socket), {}]]),
      new Map([[asWs(socket), true]]),
      sendPing,
    );

    expect(sendPing).toHaveBeenCalledOnce();
    expect(socket.terminated).toBe(true);
  });
});
