import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import {
  announceRemoteServerShutdown,
  GOING_AWAY_CLOSE_CODE,
  SHUTDOWN_CLOSE_REASON,
} from "./remoteAccessServerShutdown";

function fakeSocket(readyState: number, close?: (code?: number, reason?: string) => void) {
  return {
    readyState,
    close: vi.fn<(code?: number, reason?: string) => void>(close),
  } as unknown as WebSocket;
}

function hostWith(...clients: WebSocket[]) {
  return { clients: new Map(clients.map((client) => [client, {}])) };
}

describe("managed-host shutdown announcement", () => {
  it("queues one going-away close frame per open client", () => {
    const first = fakeSocket(WebSocket.OPEN);
    const second = fakeSocket(WebSocket.OPEN);
    const closed = fakeSocket(WebSocket.CLOSED);
    const closing = fakeSocket(WebSocket.CLOSING);
    const connecting = fakeSocket(WebSocket.CONNECTING);

    const announced = announceRemoteServerShutdown(
      hostWith(first, second, closed, closing, connecting),
    );

    expect(announced).toBe(2);
    for (const client of [first, second]) {
      expect(client.close).toHaveBeenCalledExactlyOnceWith(
        GOING_AWAY_CLOSE_CODE,
        SHUTDOWN_CLOSE_REASON,
      );
    }
    for (const client of [closed, closing, connecting]) {
      expect(client.close).not.toHaveBeenCalled();
    }
  });

  it("keeps announcing when one socket throws from its own close race", () => {
    const failing = fakeSocket(WebSocket.OPEN, () => {
      throw new Error("socket closed between the state check and the call");
    });
    const healthy = fakeSocket(WebSocket.OPEN);

    const announced = announceRemoteServerShutdown(hostWith(failing, healthy));

    expect(announced).toBe(1);
    expect(failing.close).toHaveBeenCalledOnce();
    expect(healthy.close).toHaveBeenCalledOnce();
  });
});
