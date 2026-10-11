import type { IncomingMessage, ServerResponse } from "node:http";
import { FAULT_KINDS, type FaultConfig, type FaultKind } from "./types.ts";

const TOKEN_ROUTES = new Set(["token-exchange"]);
const TICKET_ROUTES = new Set(["websocket-ticket"]);
const SNAPSHOT_ROUTES = new Set(["shell-snapshot"]);
const HISTORY_ROUTES = new Set(["thread-history", "thread-history-items"]);

export class FaultEngine {
  private readonly active = new Map<FaultKind, FaultConfig>();

  list(): FaultKind[] {
    return FAULT_KINDS.filter((kind) => this.active.has(kind));
  }

  get(kind: FaultKind): FaultConfig | undefined {
    return this.active.get(kind);
  }

  has(kind: FaultKind): boolean {
    return this.active.has(kind);
  }

  set(config: FaultConfig): void {
    this.active.set(config.kind, config);
  }

  clear(kind?: FaultKind): void {
    if (kind) {
      this.active.delete(kind);
      return;
    }
    this.active.clear();
  }

  reset(): void {
    this.active.clear();
  }

  delayMsFor(routeId: string): number {
    const mapped = this.faultForRoute(routeId);
    return mapped?.delayMs ?? 0;
  }

  shouldCancel(routeId: string): boolean {
    return this.faultForRoute(routeId)?.kind.startsWith("cancel-") === true;
  }

  async applyHttp(
    routeId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<"handled" | "continue"> {
    const delayMs = this.delayMsFor(routeId);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (this.shouldCancel(routeId)) {
      req.socket.destroy();
      return "handled";
    }
    if (this.has("unauthorized") && this.targetsRoute("unauthorized", routeId)) {
      writeFault(res, 401, "unauthorized", "Injected unauthorized fault.");
      return "handled";
    }
    if (this.has("forbidden") && this.targetsRoute("forbidden", routeId)) {
      writeFault(res, 403, "forbidden", "Injected forbidden fault.");
      return "handled";
    }
    if (this.has("redirect") && this.targetsRoute("redirect", routeId)) {
      const location = this.get("redirect")?.location ?? "/redirected";
      res.writeHead(302, { location });
      res.end();
      return "handled";
    }
    if (this.has("oversized-body") && this.targetsRoute("oversized-body", routeId)) {
      const body = `${"x".repeat(1024 * 1024 + 8)}\n`;
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return "handled";
    }
    if (this.has("chunked-body") && this.targetsRoute("chunked-body", routeId)) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "transfer-encoding": "chunked",
      });
      res.write('{"chunked":true}\n');
      await sleep(this.get("chunked-body")?.delayMs ?? 25);
      res.end();
      return "handled";
    }
    if (this.has("html-body") && this.targetsRoute("html-body", routeId)) {
      const body = "<html><body>injected</body></html>";
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return "handled";
    }
    return "continue";
  }

  private faultForRoute(routeId: string): FaultConfig | undefined {
    if (TOKEN_ROUTES.has(routeId)) {
      return this.get("delay-token") ?? this.get("cancel-token");
    }
    if (TICKET_ROUTES.has(routeId)) {
      return this.get("delay-ticket") ?? this.get("cancel-ticket");
    }
    if (SNAPSHOT_ROUTES.has(routeId)) {
      return this.get("delay-snapshot") ?? this.get("cancel-snapshot");
    }
    if (HISTORY_ROUTES.has(routeId)) {
      return this.get("delay-history") ?? this.get("cancel-history");
    }
    return undefined;
  }

  private targetsRoute(kind: FaultKind, routeId: string): boolean {
    const config = this.get(kind);
    if (!config) return false;
    if (config.routeId) return config.routeId === routeId;
    if (kind === "delay-token" || kind === "cancel-token") return TOKEN_ROUTES.has(routeId);
    if (kind === "delay-ticket" || kind === "cancel-ticket") return TICKET_ROUTES.has(routeId);
    if (kind === "delay-snapshot" || kind === "cancel-snapshot")
      return SNAPSHOT_ROUTES.has(routeId);
    if (kind === "delay-history" || kind === "cancel-history") return HISTORY_ROUTES.has(routeId);
    return (
      TOKEN_ROUTES.has(routeId) ||
      TICKET_ROUTES.has(routeId) ||
      SNAPSHOT_ROUTES.has(routeId) ||
      HISTORY_ROUTES.has(routeId)
    );
  }
}

function writeFault(res: ServerResponse, status: number, code: string, message: string): void {
  const body = `${JSON.stringify({ error: { code, message } })}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
