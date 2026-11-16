import { MODEL_IDS } from "@kitlangton/hex";

const SDK_MODEL_IDS: ReadonlySet<string> = new Set(MODEL_IDS);

function requestUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    return new URL(input instanceof Request ? input.url : input);
  } catch {
    return null;
  }
}

function requestMethod(input: Parameters<typeof fetch>[0], init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function isDrivableEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null || !("id" in entry)) return true;
  return typeof entry.id !== "string" || SDK_MODEL_IDS.has(entry.id);
}

function withBody(response: Response, body: string): Response {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Hex engines can list models that are newer than the pinned SDK's `MODEL_IDS`
 * (Hex 3.1.1 adds QwenCleo and Underdog Bark; SDK 0.3.1 does not know them). The
 * SDK rejects the whole catalog when one id is unknown, which makes the install
 * probe and the model list fail. Keep only the models this SDK can drive, and
 * leave malformed entries in place so the SDK still reports a broken catalog.
 */
export function hexCatalogFetch(transport: typeof fetch = globalThis.fetch): typeof fetch {
  const filtered = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await transport(input, init);
    if (!response.ok || requestMethod(input, init) !== "GET") return response;
    if (requestUrl(input)?.pathname !== "/models") return response;
    const text = await response.text();
    let catalog: unknown;
    try {
      catalog = JSON.parse(text);
    } catch {
      return withBody(response, text);
    }
    if (!Array.isArray(catalog)) return withBody(response, text);
    return withBody(response, JSON.stringify(catalog.filter(isDrivableEntry)));
  };
  return filtered as typeof fetch;
}
