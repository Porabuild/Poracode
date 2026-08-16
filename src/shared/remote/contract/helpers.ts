import { z } from "zod";
import type { QueryParameterCodec } from "./queryCodecs";
import { queryCodecsForRoute } from "./queryCodecs";
import type {
  RemoteHttpMethod,
  RemoteHttpRequestContract,
  RemoteHttpResponseContract,
  RemoteHttpRouteContract,
  RemoteIdempotency,
  RemoteRouteAuth,
} from "./types";
import type { RemoteAccessScope } from "../protocol";

export const emptyJsonObjectSchema = z.object({});
export const remoteOkResponseSchema = z.object({ ok: z.literal(true) });
export const emptyQuerySchema = z.object({});

export function pathParamsFromTemplate(path: string): string[] {
  return [...path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]!);
}

export function pathParamSchema(names: readonly string[]): z.ZodType | undefined {
  if (names.length === 0) return undefined;
  const shape: Record<string, z.ZodType<string>> = {};
  for (const name of names) {
    shape[name] = z.string().min(1);
  }
  return z.object(shape);
}

export function defineRoute(input: {
  readonly id: string;
  readonly method: RemoteHttpMethod;
  readonly path: string;
  readonly auth: RemoteRouteAuth;
  readonly scopes: readonly RemoteAccessScope[];
  readonly scopeResolution?: "procedure-defined";
  readonly queryParameters?: readonly string[];
  readonly queryCodecs?: readonly QueryParameterCodec[];
  readonly legacy?: true;
  readonly idempotency?: RemoteIdempotency;
  readonly request: RemoteHttpRequestContract;
  readonly response: RemoteHttpResponseContract;
}): RemoteHttpRouteContract {
  const pathParameters = pathParamsFromTemplate(input.path);
  const inferredPathSchema =
    pathParameters.length > 0 && !input.request.pathSchema
      ? pathParamSchema(pathParameters)
      : undefined;
  const queryCodecs = input.queryCodecs ?? queryCodecsForRoute(input.id);
  return {
    ...input,
    ...(pathParameters.length > 0 ? { pathParameters } : {}),
    ...(queryCodecs.length > 0 ? { queryCodecs } : {}),
    request: {
      bodyKind: input.request.bodyKind,
      ...(input.request.jsonSchema ? { jsonSchema: input.request.jsonSchema } : {}),
      ...(input.request.querySchema ? { querySchema: input.request.querySchema } : {}),
      ...(input.request.pathSchema
        ? { pathSchema: input.request.pathSchema }
        : inferredPathSchema
          ? { pathSchema: inferredPathSchema }
          : {}),
    },
  };
}
