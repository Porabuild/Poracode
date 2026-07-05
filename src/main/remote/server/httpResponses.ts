import type { ServerResponse } from "node:http";
import { ZodError } from "zod";
import { remoteHttpErrorSchema } from "@/shared/remote";
import { writeJsonResponse } from "@/shared/http";
import { RemoteHttpError } from "../auth";

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  writeJsonResponse(res, status, data, { trailingNewline: true });
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
