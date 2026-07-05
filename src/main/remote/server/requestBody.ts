import type { IncomingMessage } from "node:http";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { RemoteHttpError } from "../auth";

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const body = await readBoundedNodeRequestBody(
    req,
    MAX_JSON_BODY_BYTES,
    () => new RemoteHttpError("body_too_large", "Request body is too large.", 413),
  );
  const raw = body.toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}
