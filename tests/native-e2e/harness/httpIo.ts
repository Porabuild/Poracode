import type { IncomingMessage, ServerResponse } from "node:http";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { MAX_JSON_BODY_BYTES } from "./constants.ts";
import { LabHttpError } from "./labAuth.ts";

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  const body = `${JSON.stringify(data)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof LabHttpError) {
    writeJson(res, error.status, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  if (error instanceof SyntaxError) {
    writeJson(res, 400, {
      error: { code: "invalid_json", message: "Request body must be valid JSON." },
    });
    return;
  }
  writeJson(res, 500, {
    error: { code: "internal_error", message: "Internal server error." },
  });
}

/**
 * Funnel for request-handler errors whose body may never have been read
 * (header-time rejections: chunked encoding, auth, unknown route). After the
 * response, drain whatever body bytes remain so the socket closes with FIN —
 * closing with unread request bytes sends RST, which the client sees as
 * ECONNRESET instead of the error response. Same drain-then-reject contract
 * as HookIngress and `readBoundedNodeRequestBody`.
 */
export function writeErrorAndDrain(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
): void {
  if (res.headersSent) {
    req.socket.destroy();
    return;
  }
  writeError(res, error);
  req.resume();
}

export function rejectChunkedRequest(req: IncomingMessage): void {
  const encoding = String(req.headers["transfer-encoding"] ?? "").toLowerCase();
  if (encoding.includes("chunked")) {
    throw new LabHttpError(
      "chunked_body_not_allowed",
      "Chunked request bodies are rejected by the native-e2e wire lab.",
      400,
    );
  }
}

export async function readBoundedRawBody(
  req: IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new LabHttpError("body_too_large", "Request body is too large.", 413);
  }
  return await readBoundedNodeRequestBody(
    req,
    maxBytes,
    () => new LabHttpError("body_too_large", "Request body is too large.", 413),
  );
}

export async function readBoundedJsonBody(
  req: IncomingMessage,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const declared = req.headers["content-length"];
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new LabHttpError("body_too_large", "Request body is too large.", 413);
    }
  }
  const raw = (await readBoundedRawBody(req, maxBytes)).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

export function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function normalizeBasePath(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLead = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLead.replace(/\/+$/, "");
}

export function stripBasePath(pathname: string, basePath: string): string | null {
  if (!basePath) return pathname === "" ? "/" : pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return null;
}

export function joinBasePath(basePath: string, path: string): string {
  if (!basePath) return path;
  if (path === "/") return `${basePath}/`;
  return `${basePath}${path}`;
}
