import { z } from "zod";
import type { NormalizeExactOptionalProperties } from "@/shared/contracts/exactType";
import { RemoteClientError } from "./clientErrors";

export function parseJsonResponse(text: string, response: Response): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const htmlLike = contentType.includes("text/html") || trimmed.startsWith("<");
    throw new RemoteClientError(
      htmlLike
        ? "That endpoint returned the app HTML instead of the desktop API. Use the desktop API endpoint shown in Remote Access settings, not the web app URL."
        : "Remote request failed.",
      response.status,
      "invalid_response",
    );
  }
}

/**
 * Parse a value against a response schema, converting a {@link z.ZodError}
 * into a readable {@link RemoteClientError}. Raw ZodError `.message` is a JSON
 * issue dump that callers render verbatim (mobile toast, desktop banner); this
 * gives users a readable message and a stable `code` to branch on.
 */
export function parseResponse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new RemoteClientError(
    `The server sent an unexpected ${what} response. It may be running an incompatible version.`,
    500,
    "invalid_response",
    { cause: result.error },
  );
}

function removeExplicitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeExplicitUndefined);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined) result[key] = removeExplicitUndefined(nested);
  }
  return result;
}

/**
 * JSON cannot carry explicit `undefined`, but Zod's inferred optional properties
 * include it. Remove any transform/default-produced undefined keys recursively
 * so the validated result soundly satisfies exact-optional producer interfaces.
 */
export function parseExactOptionalResponse<Contract>(
  schema: z.ZodType<NormalizeExactOptionalProperties<Contract>>,
  value: unknown,
  what: string,
): Contract {
  return removeExplicitUndefined(parseResponse(schema, value, what)) as Contract;
}
