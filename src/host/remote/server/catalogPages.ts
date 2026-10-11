import {
  CATALOG_PAGE_MAX_LIMIT,
  CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
  CATALOG_READS_CAPABILITY,
  CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
  CatalogCursorError,
  catalogItemTooLargeBodySchema,
  type CatalogPaintOrder,
} from "@/shared/remote/catalogReadContract";
import { RemoteHttpError } from "../auth";
import {
  CatalogItemTooLargeError,
  resolveCatalogEffectiveCaps,
  type CatalogEffectiveCaps,
} from "./catalogPageBudget";
import {
  buildCatalogProjectListPage,
  buildCatalogShellSnapshotPage,
  buildCatalogThreadListPage,
  type CatalogReadNegotiation,
} from "./catalogPageBuilders";
import { writeNegotiatedJson } from "./httpCompression";
import { writeJson, writeNegotiatedJsonResponse } from "./httpResponses";
import type { HttpRouteCall } from "./httpRouteHandlers.shared";
import { buildShellSnapshot, buildThreadListPage } from "./snapshots";

/**
 * B4 catalog HTTP composition. C0 wires these handlers into the route table:
 *
 *   "shell-snapshot": handleCatalogShellSnapshot
 *   "thread-list":    handleCatalogThreadList
 *   "project-list":   handleCatalogProjectList   (new route)
 *
 * Each handler preserves the legacy path byte-for-byte for undeclared clients
 * by delegating to the existing builders, and serves the bounded path only
 * when the request echoes `reads=bounded-v1`.
 */

type CatalogRoute = "shell-snapshot" | "thread-list" | "project-list";

const INTEGER_TEXT = /^(0|[1-9]\d*)$/u;

const PAINT_ORDERS: readonly CatalogPaintOrder[] = ["manual", "updated", "created"];
const READ_MODES = ["page", "inventory"] as const;

function invalid(message: string, code = "invalid_read_param"): RemoteHttpError {
  return new RemoteHttpError(code, message, 400);
}

function parsePositiveIntParam(
  raw: string | null,
  code: string,
  label: string,
  maximum: number,
): number | undefined {
  if (raw === null) return undefined;
  if (!INTEGER_TEXT.test(raw))
    throw invalid(`${label} must be an integer between 1 and ${maximum}.`, code);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw invalid(`${label} must be an integer between 1 and ${maximum}.`, code);
  }
  return value;
}

function parseCaps(params: URLSearchParams): CatalogEffectiveCaps {
  const maxBytes = parsePositiveIntParam(
    params.get("maxBytes"),
    "invalid_max_bytes",
    "maxBytes",
    Number.MAX_SAFE_INTEGER,
  );
  const maxDecodeBytes = parsePositiveIntParam(
    params.get("maxDecodeBytes"),
    "invalid_max_decode_bytes",
    "maxDecodeBytes",
    Number.MAX_SAFE_INTEGER,
  );
  return resolveCatalogEffectiveCaps({
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    ...(maxDecodeBytes !== undefined ? { maxDecodeBytes } : {}),
  });
}

function parseOrder(params: URLSearchParams): CatalogPaintOrder {
  const raw = params.get("order");
  if (raw === null) return "manual";
  if (!PAINT_ORDERS.includes(raw as CatalogPaintOrder)) {
    throw invalid(`order must be one of ${PAINT_ORDERS.join(", ")}.`, "invalid_order");
  }
  return raw as CatalogPaintOrder;
}

function parseMode(params: URLSearchParams): "page" | "inventory" {
  const raw = params.get("mode");
  if (raw === null) return "page";
  if (!READ_MODES.includes(raw as (typeof READ_MODES)[number])) {
    throw invalid(`mode must be one of ${READ_MODES.join(", ")}.`, "invalid_mode");
  }
  return raw as "page" | "inventory";
}

function parseSummaries(params: URLSearchParams): boolean {
  const raw = params.get("summaries");
  if (raw === null) return false;
  if (raw !== "0" && raw !== "1") throw invalid("summaries must be 0 or 1.", "invalid_summaries");
  return raw === "1";
}

export function parseCatalogReadNegotiation(url: URL, route: CatalogRoute): CatalogReadNegotiation {
  const params = url.searchParams;
  const reads = params.get("reads");
  if (reads === null) {
    return {
      declared: false,
      order: "manual",
      mode: "page",
      limit: CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
      projectLimit: CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
      summaries: false,
      caps: resolveCatalogEffectiveCaps({}),
    };
  }
  if (reads !== CATALOG_READS_CAPABILITY) {
    throw invalid(
      `reads must be "${CATALOG_READS_CAPABILITY}" when present.`,
      "invalid_reads_capability",
    );
  }
  const mode = parseMode(params);
  if (route === "shell-snapshot" && mode !== "page") {
    throw invalid("shell-snapshot only serves mode=page.", "invalid_mode");
  }
  const order = parseOrder(params);
  if (route === "project-list" && order !== "manual") {
    throw invalid("project-list only serves order=manual.", "invalid_order");
  }
  if (route === "shell-snapshot") {
    return {
      declared: true,
      order,
      mode,
      limit:
        parsePositiveIntParam(
          params.get("threadLimit"),
          "invalid_thread_limit",
          "threadLimit",
          CATALOG_PAGE_MAX_LIMIT,
        ) ?? CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
      projectLimit:
        parsePositiveIntParam(
          params.get("projectLimit"),
          "invalid_project_limit",
          "projectLimit",
          CATALOG_PAGE_MAX_LIMIT,
        ) ?? CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
      summaries: parseSummaries(params),
      caps: parseCaps(params),
    };
  }
  if (route === "project-list") {
    return {
      declared: true,
      order,
      mode,
      limit: CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
      projectLimit:
        parsePositiveIntParam(
          params.get("projectLimit"),
          "invalid_project_limit",
          "projectLimit",
          CATALOG_PAGE_MAX_LIMIT,
        ) ?? CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
      summaries: parseSummaries(params),
      caps: parseCaps(params),
    };
  }
  return {
    declared: true,
    order,
    mode,
    limit:
      parsePositiveIntParam(
        params.get("limit"),
        "invalid_thread_limit",
        "limit",
        CATALOG_PAGE_MAX_LIMIT,
      ) ?? CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
    projectLimit: CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
    summaries: parseSummaries(params),
    caps: parseCaps(params),
  };
}

function mapCursorError(error: unknown, kind: "thread" | "project"): unknown {
  if (error instanceof CatalogCursorError) {
    return new RemoteHttpError(
      kind === "thread" ? "invalid_thread_cursor" : "invalid_project_cursor",
      "The catalog cursor is not recognized for the requested route, order, or mode.",
      400,
    );
  }
  return error;
}

/** Builds and writes one bounded catalog body, translating the two typed
 * refusals this slice owns (`read_item_too_large` 422, cursor 400). */
async function writeBoundedCatalogResponse(
  call: HttpRouteCall,
  kind: "thread" | "project",
  build: () => string,
): Promise<void> {
  let body: string;
  try {
    body = build();
  } catch (error) {
    if (error instanceof CatalogItemTooLargeError) {
      writeJson(call.res, 422, catalogItemTooLargeBodySchema.parse(error.body));
      return;
    }
    throw mapCursorError(error, kind);
  }
  await writeNegotiatedJson(call.req, call.res, 200, body);
}

/**
 * Parses the undeclared (legacy) `threadLimit` of `shell-snapshot`. Exact
 * legacy semantics — `Number()` conversion, integer 1–200, empty string
 * invalid. Shared by the handler and the legacy bulk-read wrapper, which
 * validates with this helper before its reservation pre-check so an invalid
 * `threadLimit` stays the handler's 400 instead of being masked by a 503.
 */
export function parseLegacyShellSnapshotOptions(url: URL): {
  readonly threadListLimit?: number;
} {
  const threadLimitRaw = url.searchParams.get("threadLimit");
  if (threadLimitRaw === null) return {};
  const threadListLimit = Number(threadLimitRaw);
  if (
    threadLimitRaw === "" ||
    !Number.isSafeInteger(threadListLimit) ||
    threadListLimit < 1 ||
    threadListLimit > 200
  ) {
    throw new RemoteHttpError(
      "invalid_thread_limit",
      "threadLimit must be an integer between 1 and 200.",
      400,
    );
  }
  return { threadListLimit };
}

export async function handleCatalogShellSnapshot(call: HttpRouteCall): Promise<void> {
  const { ctx, req, res, url } = call;
  const negotiation = parseCatalogReadNegotiation(url, "shell-snapshot");
  if (!negotiation.declared) {
    // Exact legacy path: `threadLimit` opts into the existing bounded list.
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      buildShellSnapshot(ctx, parseLegacyShellSnapshotOptions(url)),
    );
    return;
  }
  await writeBoundedCatalogResponse(call, "thread", () =>
    buildCatalogShellSnapshotPage(ctx, negotiation),
  );
}

export async function handleCatalogThreadList(call: HttpRouteCall): Promise<void> {
  const { ctx, req, res, url } = call;
  const negotiation = parseCatalogReadNegotiation(url, "thread-list");
  if (!negotiation.declared) {
    // Exact legacy path: `limit` is required and `cursor` is the tp1. cursor.
    const limitRaw = url.searchParams.get("limit");
    const limit = Number(limitRaw);
    if (limitRaw === null || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new RemoteHttpError(
        "invalid_thread_limit",
        "limit must be an integer between 1 and 200.",
        400,
      );
    }
    const cursor = url.searchParams.get("cursor");
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      buildThreadListPage(ctx, { limit, ...(cursor !== null ? { cursor } : {}) }),
    );
    return;
  }
  const cursor = url.searchParams.get("cursor");
  await writeBoundedCatalogResponse(call, "thread", () =>
    buildCatalogThreadListPage(ctx, negotiation, cursor ?? undefined),
  );
}

export async function handleCatalogProjectList(call: HttpRouteCall): Promise<void> {
  const { ctx, url } = call;
  const negotiation = parseCatalogReadNegotiation(url, "project-list");
  if (!negotiation.declared) {
    // New route: only declared clients call it (they learned it from the
    // snapshot echo), so an undeclared request is a protocol error.
    throw new RemoteHttpError(
      "invalid_reads_capability",
      `project-list requires reads=${CATALOG_READS_CAPABILITY}.`,
      400,
    );
  }
  const cursor = url.searchParams.get("cursor");
  await writeBoundedCatalogResponse(call, "project", () =>
    buildCatalogProjectListPage(ctx, negotiation, cursor ?? undefined),
  );
}
