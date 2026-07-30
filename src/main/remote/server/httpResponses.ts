import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { remoteHttpErrorSchema } from "@/shared/remote";
import { writeJsonResponse } from "@/shared/http";
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

export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof RemoteHttpError) {
    writeJson(
      res,
      error.status,
      remoteHttpErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
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
