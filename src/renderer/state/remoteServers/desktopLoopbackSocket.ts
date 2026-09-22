/**
 * The managed loopback leg's socket shape and its DOM WebSocket adapter.
 *
 * The intake talks to this narrow interface so tests can drive open/message/
 * close deterministically (including a socket that never opens and a
 * half-open connection that only a health probe can detect).
 */
export interface DesktopLoopbackSocket {
  close(): void;
  send(data: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null;
}

/** Production adapter over the renderer's DOM WebSocket. */
export function createDomDesktopLoopbackSocket(url: string): DesktopLoopbackSocket {
  const socket = new WebSocket(url);
  // Delegate through locals: DOM handler signatures carry `this`/event
  // parameters this module's narrow socket shape does not model.
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null =
    null;
  socket.addEventListener("open", () => onopen?.());
  socket.addEventListener("message", (event) =>
    onmessage?.({ data: (event as MessageEvent).data }),
  );
  socket.addEventListener("close", (event) => {
    onclose?.({ code: event.code, reason: event.reason });
  });
  return {
    close: () => socket.close(),
    send: (data) => socket.send(data),
    get onopen() {
      return onopen;
    },
    set onopen(handler) {
      onopen = handler;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler) {
      onmessage = handler;
    },
    get onclose() {
      return onclose;
    },
    set onclose(handler) {
      onclose = handler;
    },
  };
}
