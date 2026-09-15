import { expect, it, vi } from "vitest";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  createTerminalFeedConnections,
  prepareTerminalConnection,
  terminalCapabilitiesFromEnvironment,
} from "./terminalCapabilities";

type Environment = Awaited<ReturnType<RemoteDesktopClient["environment"]>>;
// Only capability fields are consumed by the pure projection in this fixture.
function environment(versions?: number[]): Environment {
  return (versions ? { capabilities: { terminalCursorSync: { versions } } } : {}) as Environment;
}

it("opts in at the newest advertised version this build supports", () => {
  // v2-capable host: pick 2 (chunked baselines + resume).
  expect(terminalCapabilitiesFromEnvironment(environment([1, 2]))).toEqual({
    cursorSyncVersion: 2,
  });
  expect(terminalCapabilitiesFromEnvironment(environment([2]))).toEqual({
    cursorSyncVersion: 2,
  });
  // v1-only host stays on v1.
  expect(terminalCapabilitiesFromEnvironment(environment([1]))).toEqual({
    cursorSyncVersion: 1,
  });
  expect(terminalCapabilitiesFromEnvironment(environment())).toEqual({});
  // Nothing advertised intersects this build's supported set.
  expect(terminalCapabilitiesFromEnvironment(environment([3, 4]))).toEqual({});
});

it("reuses a freshly fetched initial descriptor without a duplicate request", async () => {
  const readEnvironment = vi.fn<RemoteDesktopClient["environment"]>();
  const result = await prepareTerminalConnection(
    { environment: readEnvironment, websocketTicket: async () => "ticket" },
    { cursorSyncVersion: 1 },
  );
  expect(readEnvironment).not.toHaveBeenCalled();
  expect(result).toEqual({ ticket: "ticket", capabilities: { cursorSyncVersion: 1 } });
});

it("fetches capabilities alongside the ticket and drops support after downgrade", async () => {
  const descriptor = Promise.withResolvers<Environment>();
  const ticket = Promise.withResolvers<string>();
  const readEnvironment = vi.fn<RemoteDesktopClient["environment"]>(() => descriptor.promise);
  const readTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(() => ticket.promise);
  const preparing = prepareTerminalConnection({
    environment: readEnvironment,
    websocketTicket: readTicket,
  });
  expect(readEnvironment).toHaveBeenCalledOnce();
  expect(readTicket).toHaveBeenCalledOnce();
  descriptor.resolve(environment());
  ticket.resolve("new-ticket");
  expect(await preparing).toEqual({ ticket: "new-ticket", capabilities: {} });
});

it("reuses a connection sender and rejects writes once that socket is stale", () => {
  const messages: string[] = [];
  const socket = {
    send: (message: string) => messages.push(message),
    close: () => undefined,
    onmessage: null,
    onclose: null,
  };
  let current = true;
  const install = vi.fn<Parameters<typeof createTerminalFeedConnections>[0]>();
  const connections = createTerminalFeedConnections(install, () => current);
  connections.remember(socket, { cursorSyncVersion: 1 });
  connections.activate("host", socket);
  const sender = install.mock.calls[0]![1];
  connections.activate("host", socket);
  expect(install.mock.calls[1]![1]).toBe(sender);
  expect(sender({ type: "terminal-watch", id: "shell" })).toBe(true);
  current = false;
  expect(sender({ type: "terminal-watch", id: "shell" })).toBe(false);
  expect(messages).toHaveLength(1);
});

it("waits for socket open before activating the feed and rejects closing-socket writes", () => {
  const socket = {
    readyState: 0,
    send: vi.fn<(data: string) => void>(),
    close: vi.fn<() => void>(),
    onmessage: null,
    onclose: null,
  };
  const install = vi.fn<Parameters<typeof createTerminalFeedConnections>[0]>();
  const connections = createTerminalFeedConnections(install, () => true);
  connections.remember(socket, { cursorSyncVersion: 1 });
  connections.activate("host", socket);
  expect(install).not.toHaveBeenCalled();
  socket.readyState = 1;
  connections.activate("host", socket);
  expect(install).toHaveBeenCalledOnce();
  const sender = install.mock.calls[0]![1];
  expect(sender({ type: "terminal-watch", id: "shell" })).toBe(true);
  socket.readyState = 2;
  expect(sender({ type: "terminal-watch", id: "shell" })).toBe(false);
  expect(socket.send).toHaveBeenCalledOnce();
});
