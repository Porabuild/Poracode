import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { remoteHttpErrorSchema } from "@/shared/remote";
import { writeJsonResponse } from "@/shared/http";
import {
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  hostResourceRetryAfterMsOf,
  isHostResourceAdmissionRefusal,
  isHostResourceBusyError,
} from "@/shared/hostResourceAdmission";
import { RemoteHttpError } from "../auth";
import { writeNegotiatedJson } from "./httpCompression";

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  writeJsonResponse(res, status, data, { trailingNewline: true });
}

/**
 * `writeJson` plus gzip negotiation and a revalidating `ETag`. Used by the large
 * read endpoints (shell snapshot, thread history, runtime pages) — the responses
 * that dominate remote bandwidth and that clients re-fetch on every
 * status-affecting event. Small fixed-shape replies stay on `writeJson`; they sit
 * under the compression threshold anyway.
 */
export async function writeNegotiatedJsonResponse(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  data: unknown,
): Promise<void> {
  await writeNegotiatedJson(req, res, status, `${JSON.stringify(data)}\n`);
}

export function writeHtml(res: ServerResponse, status: number, html: string): void {
  writeText(res, status, html, "text/html; charset=utf-8");
}

export function writeText(
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

/**
 * Host-chosen filenames for image responses, keyed by content type (Gate 6
 * item 4.4, S4). The name is FIXED by the server — never derived from a
 * client-supplied path or query value — so the disposition header can neither
 * leak the host path nor smuggle an attacker-chosen name into a download.
 */
const IMAGE_RESPONSE_FILENAMES: Readonly<Record<string, string>> = {
  "image/png": "image.png",
  "image/jpeg": "image.jpg",
  "image/gif": "image.gif",
  "image/webp": "image.webp",
  "image/svg+xml": "image.svg",
  "image/bmp": "image.bmp",
  "image/avif": "image.avif",
  "image/x-icon": "image.ico",
};

/**
 * Gate 6 item 4.4 (S4): image routes serve client-origin bytes from the
 * client's own origin, so every image response
 *
 * - opts the (only reachable via navigation) document out of script/anchor
 *   context with `Content-Security-Policy: sandbox`,
 * - forbids content sniffing with `X-Content-Type-Options: nosniff`, and
 * - carries `Content-Disposition` with a fixed host-chosen filename.
 *
 * SVG — an active-content image format — is forced to `attachment`. Embedded
 * `<img>` loads ignore Content-Disposition, so chat/attachment images still
 * render in the web client; only a top-level navigation (the XSS vector) is
 * turned into a download.
 */
export function writeHardenedImageResponse(
  res: ServerResponse,
  input: {
    readonly contentType: string;
    readonly data: Uint8Array;
    readonly cacheControl: string;
  },
): void {
  const filename = IMAGE_RESPONSE_FILENAMES[input.contentType] ?? "image";
  const disposition = input.contentType === "image/svg+xml" ? "attachment" : "inline";
  res.appendHeader("Vary", "Authorization");
  res.writeHead(200, {
    "content-type": input.contentType,
    "content-length": input.data.length,
    "cache-control": input.cacheControl,
    "content-security-policy": "sandbox",
    "x-content-type-options": "nosniff",
    "content-disposition": `${disposition}; filename="${filename}"`,
  });
  res.end(input.data);
}

/**
 * Maps a typed host-resource-admission refusal (rehydrated from the supervisor
 * reply by `SupervisorClient`) to the existing HTTP error shape. Both refusal
 * codes are a definite, retryable 429; only `host_resource_busy` carries a
 * `Retry-After` hint — an unavailable policy must not promise a retry that
 * cannot succeed yet. A refusal that reached a route whose earlier effects
 * cannot be excluded never arrives here: `runRemoteCommand` answers the typed
 * 409 first.
 */
function hostResourceAdmissionHttpError(error: unknown): RemoteHttpError | null {
  if (!isHostResourceAdmissionRefusal(error)) return null;
  const code = (error as { code?: unknown }).code;
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Host resources are unavailable for a new start.";
  return new RemoteHttpError(
    typeof code === "string" && code.length > 0 ? code : HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
    message,
    429,
    isHostResourceBusyError(error) ? hostResourceRetryAfterMsOf(error) : undefined,
  );
}

export function writeError(res: ServerResponse, error: unknown): void {
  const httpError =
    error instanceof RemoteHttpError ? error : hostResourceAdmissionHttpError(error);
  if (httpError) {
    // B3: a typed overload carries a retry hint; surface it as the standard
    // `Retry-After` header (seconds) on 429/503. The JSON error body is
    // unchanged, so every existing client keeps parsing exactly what it did.
    if (
      httpError.retryAfterMs !== undefined &&
      (httpError.status === 429 || httpError.status === 503)
    ) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(httpError.retryAfterMs / 1_000))));
    }
    writeJson(
      res,
      httpError.status,
      remoteHttpErrorSchema.parse({
        error: {
          code: httpError.code,
          message: httpError.message,
        },
      }),
    );
    return;
  }
  if (error instanceof SyntaxError) {
    writeJson(
      res,
      400,
      remoteHttpErrorSchema.parse({
        error: { code: "invalid_json", message: "Request body must be valid JSON." },
      }),
    );
    return;
  }
  if (error instanceof ZodError) {
    writeJson(
      res,
      400,
      remoteHttpErrorSchema.parse({
        error: { code: "invalid_request", message: "Request payload is invalid." },
      }),
    );
    return;
  }
  writeJson(
    res,
    500,
    remoteHttpErrorSchema.parse({
      error: { code: "internal_error", message: "Internal server error." },
    }),
  );
}
