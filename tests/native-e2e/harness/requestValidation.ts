import type { IncomingMessage } from "node:http";
import { decodeQueryValue } from "../../../src/shared/remote/contract/queryCodecs.ts";
import { REMOTE_HTTP_ROUTES } from "../../../src/shared/remote/contract/routes/index.ts";
import { LabHttpError } from "./labAuth.ts";
import { readBoundedJsonBody, readBoundedRawBody } from "./httpIo.ts";

export interface ValidatedRouteRequest {
  readonly body: unknown;
  readonly query: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, string>>;
  readonly rawBody?: Buffer;
}

export async function validateRouteRequest(
  req: IncomingMessage,
  url: URL,
  routeId: string,
  params: Readonly<Record<string, string>>,
): Promise<ValidatedRouteRequest> {
  const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === routeId);
  if (!route) throw new LabHttpError("invalid_path", "Unknown route contract.", 400);
  try {
    const parsedParams = (route.request.pathSchema?.parse(params) ?? params) as Readonly<
      Record<string, string>
    >;
    const query: Record<string, unknown> = {};
    const allowed = new Set(route.queryCodecs?.map((codec) => codec.name) ?? []);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key)) throw new Error(`Unknown query parameter: ${key}`);
    }
    for (const codec of route.queryCodecs ?? []) {
      const values = url.searchParams.getAll(codec.name);
      if (values.length > 1) throw new Error(`Repeated query parameter: ${codec.name}`);
      if (values.length === 0) {
        if (!codec.optional) throw new Error(`Missing query parameter: ${codec.name}`);
        continue;
      }
      query[codec.name] = decodeQueryValue(codec.kind, values[0]!);
    }
    const parsedQuery = (route.request.querySchema?.parse(query) ?? query) as Readonly<
      Record<string, unknown>
    >;
    if (route.request.bodyKind === "raw-upload") {
      const rawBody = await readBoundedRawBody(req);
      if (rawBody.length === 0) throw new Error("Raw upload body must not be empty.");
      return { body: {}, query: parsedQuery, params: parsedParams, rawBody };
    }
    const body = await readBoundedJsonBody(req);
    if (route.request.bodyKind === "empty") {
      if (Object.keys(body as Record<string, unknown>).length !== 0) {
        throw new Error("Request body must be empty.");
      }
      return { body: {}, query: parsedQuery, params: parsedParams };
    }
    const parsedBody = route.request.jsonSchema?.parse(body) ?? body;
    return { body: parsedBody, query: parsedQuery, params: parsedParams };
  } catch (error) {
    if (error instanceof LabHttpError) throw error;
    throw new LabHttpError(
      "invalid_request",
      error instanceof Error ? error.message : "Request does not match the generated contract.",
      400,
    );
  }
}
