import { describe, expect, it, vi } from "vitest";
import { createRemoteSocketSender } from "./remoteSocketSender";

describe("createRemoteSocketSender", () => {
  it("sends serialized websocket messages when the socket is open", () => {
    const socket = {
      readyState: 1,
      send: vi.fn<(data: string) => void>(),
      close: vi.fn<() => void>(),
    };
    const send = createRemoteSocketSender(socket);

    expect(send({ type: "terminal-watch", id: "thread-1" })).toBe(true);

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "terminal-watch", id: "thread-1" }),
    );
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("returns false without sending when the socket is not open", () => {
    const socket = {
      readyState: 3,
      send: vi.fn<(data: string) => void>(),
      close: vi.fn<() => void>(),
    };
    const send = createRemoteSocketSender(socket);

    expect(send({ type: "browser-watch" })).toBe(false);

    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("closes the socket and returns false when send throws", () => {
    const socket = {
      readyState: 1,
      send: vi.fn<(data: string) => void>(() => {
        throw new Error("socket closed");
      }),
      close: vi.fn<() => void>(),
    };
    const send = createRemoteSocketSender(socket);

    expect(send({ type: "browser-watch" })).toBe(false);

    expect(socket.close).toHaveBeenCalledOnce();
  });
});
