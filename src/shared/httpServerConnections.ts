import type { Server } from "node:http";
import type { Socket } from "node:net";

/** Tracks HTTP, keep-alive, and upgraded sockets through their actual close. */
export class HttpServerConnections {
  private readonly sockets = new Set<Socket>();
  private stopping = false;
  private closing: Promise<void> | undefined;
  private checkClosed: (() => void) | undefined;

  constructor(private readonly server: Server) {
    server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => {
        this.sockets.delete(socket);
        this.checkClosed?.();
      });
      if (this.stopping) socket.destroy();
    });
  }

  /** Join any pending listen operation before calling this method. */
  close(graceMs: number): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    this.closing = new Promise<void>((resolve, reject) => {
      let serverClosed = false;
      const timer = setTimeout(() => {
        // server.closeAllConnections excludes upgraded connections. Every
        // socket here belongs to this listener, including forwarded upgrades.
        for (const socket of this.sockets) socket.destroy();
      }, graceMs);
      this.checkClosed = () => {
        if (!serverClosed || this.sockets.size > 0) return;
        clearTimeout(timer);
        this.checkClosed = undefined;
        resolve();
      };
      this.server.close((error?: Error) => {
        if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
          clearTimeout(timer);
          this.checkClosed = undefined;
          reject(error);
          return;
        }
        serverClosed = true;
        this.checkClosed?.();
      });
      this.server.closeIdleConnections();
    });
    return this.closing;
  }
}
