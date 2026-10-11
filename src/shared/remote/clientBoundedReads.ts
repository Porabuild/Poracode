import { z } from "zod";
import { RemoteClientError } from "./clientErrors";
import { parseResponse } from "./clientParse";
import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_PAGE_MAX_LIMIT,
  CATALOG_PROJECT_PAGE_DEFAULT_LIMIT,
  CATALOG_READS_CAPABILITY,
  CATALOG_THREAD_PAGE_DEFAULT_LIMIT,
  catalogMembershipResponseSchema,
  decodeCatalogInventoryCursor,
  decodeCatalogProjectPaintCursor,
  decodeCatalogThreadPaintCursor,
  type CatalogMembershipRequest,
  type CatalogMembershipResponse,
  type CatalogPaintOrder,
  type CatalogReadMode,
} from "./catalogReadContract";
import {
  boundedShellSnapshotSchema,
  boundedThreadListPageSchema,
  catalogProjectListPageSchema,
  type CatalogProjectListPage,
} from "./catalogReadSchemas";
import { boundedRuntimeItemsPageSchema, boundedThreadSnapshotSchema } from "./historyReadSchemas";
import {
  HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
  HISTORY_ITEMS_DEFAULT_LIMIT,
  decodeCompletedTurnCursor,
  historyTurnPageSchema,
  type HistoryTurnPage,
} from "./historyReadContract";
import {
  remoteRuntimeItemsPageSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
  remoteThreadSnapshotSchema,
  remoteTimelineEntryCountSchema,
  type RemoteRuntimeItemsPage,
  type RemoteShellSnapshot,
  type RemoteThreadListPage,
  type RemoteThreadSnapshot,
} from "./protocol";

/**
 * B4 bounded-read client protocol (`reads=bounded-v1`).
 *
 * This module owns the client half of the frozen wire surface described in
 * `tmp/v2-production/b4-contract-host-integration.md` §1: capability echoes,
 * page/turn cursors, byte-budget labels, negotiation decisions and the typed
 * protocol errors. The API mixins stay thin request builders against it.
 *
 * Negotiation rules (ratified §6):
 *
 * - the ABSENT `reads` echo on a first response is the ONLY downgrade signal
 *   (genuine older host);
 * - an unknown/malformed echo, a missing bounded field, a missing declared
 *   route, or a cursor that does not match the requested mode/order is a
 *   protocol error, never an automatic bulk downgrade;
 * - once a bounded page has been observed, a continuation that omits the echo
 *   is a violation.
 *
 * Byte accounting (labels, not estimates): `maxBytes` is the UTF-8 byte length
 * of the serialized response body; `maxDecodeBytes` is `2 × serialized.length`
 * (UTF-16 code units × 2) — the client engine's raw frame charge. Neither is a
 * parsed-object, structured-clone, heap or RSS bound.
 */
export const REMOTE_BOUNDED_READS_CAPABILITY = CATALOG_READS_CAPABILITY;

/** Default wire budget: UTF-8 bytes of the serialized response body. */
export const REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES = CATALOG_HOST_WIRE_MAX_BYTES;

/** Default decode budget: `2 × serialized.length` (UTF-16 code units × 2). */
export const REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES = CATALOG_HOST_DECODE_MAX_BYTES;

/** Exact accounting label of the wire budget (`read_item_too_large` body). */
export const REMOTE_BOUNDED_READ_WIRE_BUDGET_LABEL = "utf8-serialized" as const;

/** Exact accounting label of the decode budget (`read_item_too_large` body). */
export const REMOTE_BOUNDED_READ_DECODE_BUDGET_LABEL = "utf16-code-units-x2" as const;

export const REMOTE_BOUNDED_READ_PROTOCOL_ERROR_CODE = "bounded_read_protocol_error";
export const REMOTE_INVALID_READS_REQUEST_CODE = "invalid_reads_request";

export const REMOTE_BOUNDED_THREAD_DEFAULT_LIMIT = CATALOG_THREAD_PAGE_DEFAULT_LIMIT;
export const REMOTE_BOUNDED_PROJECT_DEFAULT_LIMIT = CATALOG_PROJECT_PAGE_DEFAULT_LIMIT;
export const REMOTE_BOUNDED_HISTORY_ITEMS_DEFAULT_LIMIT = HISTORY_ITEMS_DEFAULT_LIMIT;
export const REMOTE_BOUNDED_TURNS_DEFAULT_LIMIT = HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT;
export const REMOTE_BOUNDED_MAX_LIMIT = CATALOG_PAGE_MAX_LIMIT;

export type RemoteBoundedReadViolation =
  | "reads_echo_mismatch"
  | "reads_echo_absent_after_negotiation"
  | "bounded_response_invalid"
  | "cursor_mismatch"
  | "route_unavailable"
  | "membership_response_invalid";

export class RemoteBoundedReadProtocolError extends RemoteClientError {
  readonly violation: RemoteBoundedReadViolation;

  constructor(violation: RemoteBoundedReadViolation, message: string, options?: ErrorOptions) {
    super(message, 500, REMOTE_BOUNDED_READ_PROTOCOL_ERROR_CODE, options);
    this.violation = violation;
    this.name = "RemoteBoundedReadProtocolError";
  }
}

export function isRemoteBoundedReadProtocolError(
  error: unknown,
): error is RemoteBoundedReadProtocolError {
  return (
    error instanceof RemoteBoundedReadProtocolError ||
    (error instanceof RemoteClientError && error.code === REMOTE_BOUNDED_READ_PROTOCOL_ERROR_CODE)
  );
}

export function boundedReadProtocolError(
  violation: RemoteBoundedReadViolation,
  message: string,
  cause?: unknown,
): RemoteBoundedReadProtocolError {
  return new RemoteBoundedReadProtocolError(
    violation,
    message,
    cause !== undefined ? { cause } : undefined,
  );
}

export function invalidReadsRequest(
  message: string,
  code: string = REMOTE_INVALID_READS_REQUEST_CODE,
): RemoteClientError {
  return new RemoteClientError(message, 400, code);
}

/** A bounded page proves the host echoed `reads=bounded-v1` on this route. */
export interface RemoteBoundedReadsProof {
  readonly reads: typeof CATALOG_READS_CAPABILITY;
}

export type RemoteBoundedReadFirst<TBounded extends RemoteBoundedReadsProof, TLegacy> =
  | { readonly negotiation: "bounded"; readonly page: TBounded }
  | { readonly negotiation: "legacy"; readonly page: TLegacy };

/** Wire/decode budgets; labels are exact accounting, never memory estimates. */
export interface RemoteBoundedReadByteBudget {
  /** UTF-8 bytes of the serialized response body (`maxBytes`). */
  readonly maxBytes?: number;
  /** `2 × serialized.length`, UTF-16 code units × 2 (`maxDecodeBytes`); never heap bytes. */
  readonly maxDecodeBytes?: number;
}

export type RemoteBoundedShellSnapshotPage = z.infer<typeof boundedShellSnapshotSchema>;
export type RemoteBoundedThreadListPage = z.infer<typeof boundedThreadListPageSchema>;
export type RemoteBoundedProjectListPage = CatalogProjectListPage;
export type RemoteBoundedThreadHistoryPage = z.infer<typeof boundedThreadSnapshotSchema>;
export type RemoteBoundedHistoryItemsPage = z.infer<typeof boundedRuntimeItemsPageSchema>;
export type RemoteBoundedTurnsPage = HistoryTurnPage;

export type RemoteBoundedShellSnapshotResult = RemoteBoundedReadFirst<
  RemoteBoundedShellSnapshotPage,
  RemoteShellSnapshot
>;
export type RemoteBoundedThreadListResult = RemoteBoundedReadFirst<
  RemoteBoundedThreadListPage,
  RemoteThreadListPage
>;
export type RemoteBoundedThreadHistoryResult = RemoteBoundedReadFirst<
  RemoteBoundedThreadHistoryPage,
  RemoteThreadSnapshot
>;
export type RemoteBoundedHistoryItemsResult = RemoteBoundedReadFirst<
  RemoteBoundedHistoryItemsPage,
  RemoteRuntimeItemsPage
>;

export interface RemoteBoundedShellSnapshotOptions extends RemoteBoundedReadByteBudget {
  readonly order?: CatalogPaintOrder;
  readonly threadLimit?: number;
  readonly projectLimit?: number;
  readonly summaries?: boolean;
  readonly signal?: AbortSignal;
}

export type RemoteBoundedThreadPageOptions = RemoteBoundedReadByteBudget & {
  readonly mode?: CatalogReadMode;
  readonly order?: CatalogPaintOrder;
  readonly limit?: number;
  readonly summaries?: boolean;
  readonly signal?: AbortSignal;
} & (
    | { readonly cursor: string; readonly after: RemoteBoundedReadsProof }
    | { readonly cursor?: undefined; readonly after?: RemoteBoundedReadsProof }
  );

export interface RemoteBoundedProjectPageOptions extends RemoteBoundedReadByteBudget {
  readonly mode?: CatalogReadMode;
  readonly projectLimit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface RemoteBoundedThreadHistoryOptions extends RemoteBoundedReadByteBudget {
  readonly completedTurnsLimit?: number;
  readonly targetTimelineEntryCount?: number;
  readonly omitScrollback?: boolean;
  /** B1: declare `notices=v1` (only with a real notice UI installed). */
  readonly noticesCapable?: boolean;
  readonly signal?: AbortSignal;
}

export type RemoteBoundedHistoryItemsInput = RemoteBoundedReadByteBudget & {
  readonly threadId: string;
  readonly limit?: number;
  readonly targetTimelineEntryCount?: number;
  /** B1: declare `notices=v1` (only with a real notice UI installed). */
  readonly noticesCapable?: boolean;
  readonly signal?: AbortSignal;
} & (
    | { readonly beforePosition: number; readonly after: RemoteBoundedReadsProof }
    | { readonly beforePosition?: undefined; readonly after?: RemoteBoundedReadsProof }
  );

export interface RemoteBoundedTurnsInput extends RemoteBoundedReadByteBudget {
  readonly threadId: string;
  readonly cursor?: string;
  readonly limit?: number;
  /** B1: declare `notices=v1` (only with a real notice UI installed). */
  readonly noticesCapable?: boolean;
  readonly signal?: AbortSignal;
}

interface ReadsEcho {
  readonly present: boolean;
  readonly value: unknown;
}

function readsEchoOf(body: unknown): ReadsEcho {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { present: false, value: undefined };
  }
  if (!Object.prototype.hasOwnProperty.call(body, "reads")) {
    return { present: false, value: undefined };
  }
  return { present: true, value: (body as Record<string, unknown>).reads };
}

/**
 * Strict bounded parse: the echo must be present and exactly `bounded-v1`, and
 * the response must satisfy the route's strict bounded schema. Any deviation is
 * a protocol error (negative cases are never treated as a downgrade).
 */
export function parseStrictBoundedRead<TBounded>(
  body: unknown,
  schema: z.ZodType<TBounded>,
  what: string,
): TBounded {
  const echo = readsEchoOf(body);
  if (!echo.present) {
    throw boundedReadProtocolError(
      "reads_echo_absent_after_negotiation",
      `The host omitted the bounded reads echo on a ${what} response after negotiation.`,
    );
  }
  if (echo.value !== REMOTE_BOUNDED_READS_CAPABILITY) {
    throw boundedReadProtocolError(
      "reads_echo_mismatch",
      `The host echoed an unknown reads capability ("${String(echo.value)}") on a ${what} response.`,
    );
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw boundedReadProtocolError(
      "bounded_response_invalid",
      `The host echoed ${REMOTE_BOUNDED_READS_CAPABILITY} but sent a ${what} response missing required bounded fields.`,
      result.error,
    );
  }
  return result.data;
}

/**
 * First negotiation: only an ABSENT echo means a genuine older host. A present
 * echo that is unknown or malformed is a protocol error.
 */
export function parseFirstBoundedRead<TBounded extends RemoteBoundedReadsProof, TLegacy>(
  body: unknown,
  boundedSchema: z.ZodType<TBounded>,
  legacySchema: z.ZodType<TLegacy>,
  what: string,
): RemoteBoundedReadFirst<TBounded, TLegacy> {
  if (!readsEchoOf(body).present) {
    return { negotiation: "legacy", page: parseResponse(legacySchema, body, what) };
  }
  return { negotiation: "bounded", page: parseStrictBoundedRead(body, boundedSchema, what) };
}

/** Request preflight: a cursor can only match the mode/order it was minted for. */
export function assertRemoteBoundedThreadCursor(
  cursor: string,
  mode: CatalogReadMode,
  order: CatalogPaintOrder,
): void {
  try {
    if (mode === "inventory") {
      decodeCatalogInventoryCursor(cursor, "thread");
      return;
    }
    if (decodeCatalogThreadPaintCursor(cursor).order !== order) {
      throw new Error("paint cursor order mismatch");
    }
  } catch (cause) {
    throw boundedReadProtocolError(
      "cursor_mismatch",
      `The thread-list cursor does not match mode=${mode} order=${order}; restart the bounded walk.`,
      cause,
    );
  }
}

/** Request preflight for the project route. */
export function assertRemoteBoundedProjectCursor(cursor: string, mode: CatalogReadMode): void {
  try {
    if (mode === "inventory") {
      decodeCatalogInventoryCursor(cursor, "project");
      return;
    }
    decodeCatalogProjectPaintCursor(cursor);
  } catch (cause) {
    throw boundedReadProtocolError(
      "cursor_mismatch",
      `The project-list cursor does not match mode=${mode}; restart the bounded walk.`,
      cause,
    );
  }
}

/** Request/response preflight for the `ct1.` completed-turn cursor. */
export function assertRemoteBoundedCompletedTurnCursor(cursor: string): void {
  try {
    decodeCompletedTurnCursor(cursor);
  } catch (cause) {
    throw boundedReadProtocolError(
      "cursor_mismatch",
      "The completed-turn cursor is not a recognized ct1. cursor; restart the bounded walk.",
      cause,
    );
  }
}

function assertThreadInventoryFrontier(
  page: RemoteBoundedThreadListPage,
  mode: CatalogReadMode,
  cursorProvided: boolean,
): void {
  if (mode !== "inventory" || cursorProvided) return;
  if (page.threads.length > 0 && page.inventoryFrontier === undefined) {
    throw boundedReadProtocolError(
      "bounded_response_invalid",
      "The first bounded thread inventory page omitted its inventoryFrontier.",
    );
  }
  if (page.nextCursor !== null && page.inventoryFrontier !== undefined) {
    const decoded = decodeCatalogInventoryCursor(page.nextCursor, "thread");
    if (decoded.frontier !== page.inventoryFrontier) {
      throw boundedReadProtocolError(
        "bounded_response_invalid",
        "The bounded thread inventory cursor frontier disagrees with inventoryFrontier.",
      );
    }
  }
}

function assertProjectInventoryFrontier(
  page: RemoteBoundedProjectListPage,
  mode: CatalogReadMode,
  cursorProvided: boolean,
): void {
  if (mode !== "inventory" || cursorProvided) return;
  if (page.projects.length > 0 && page.inventoryFrontier === undefined) {
    throw boundedReadProtocolError(
      "bounded_response_invalid",
      "The first bounded project inventory page omitted its inventoryFrontier.",
    );
  }
  if (page.projectsNextCursor !== null && page.inventoryFrontier !== undefined) {
    const decoded = decodeCatalogInventoryCursor(page.projectsNextCursor, "project");
    if (decoded.frontier !== page.inventoryFrontier) {
      throw boundedReadProtocolError(
        "bounded_response_invalid",
        "The bounded project inventory cursor frontier disagrees with inventoryFrontier.",
      );
    }
  }
}

function assertCompletedTurnsCursor(cursor: string | null): void {
  if (cursor !== null) assertRemoteBoundedCompletedTurnCursor(cursor);
}

export function parseBoundedShellSnapshot(body: unknown): RemoteBoundedShellSnapshotResult {
  return parseFirstBoundedRead(
    body,
    boundedShellSnapshotSchema,
    remoteShellSnapshotSchema,
    "shell snapshot",
  );
}

export function parseBoundedThreadListPage(
  body: unknown,
  context: {
    readonly mode: CatalogReadMode;
    readonly order: CatalogPaintOrder;
    readonly cursorProvided: boolean;
    readonly strict: boolean;
  },
): RemoteBoundedThreadListResult {
  const outcome: RemoteBoundedThreadListResult = context.strict
    ? {
        negotiation: "bounded",
        page: parseStrictBoundedRead(body, boundedThreadListPageSchema, "thread list page"),
      }
    : parseFirstBoundedRead(
        body,
        boundedThreadListPageSchema,
        remoteThreadListPageSchema,
        "thread list page",
      );
  if (outcome.negotiation === "bounded") {
    if (outcome.page.nextCursor !== null) {
      assertRemoteBoundedThreadCursor(outcome.page.nextCursor, context.mode, context.order);
    }
    assertThreadInventoryFrontier(outcome.page, context.mode, context.cursorProvided);
  }
  return outcome;
}

export function parseBoundedProjectListPage(
  body: unknown,
  context: { readonly mode: CatalogReadMode; readonly cursorProvided: boolean },
): RemoteBoundedProjectListPage {
  const page = parseStrictBoundedRead(body, catalogProjectListPageSchema, "project list page");
  if (page.projectsNextCursor !== null) {
    assertRemoteBoundedProjectCursor(page.projectsNextCursor, context.mode);
  }
  assertProjectInventoryFrontier(page, context.mode, context.cursorProvided);
  return page;
}

export function parseBoundedThreadHistoryPage(body: unknown): RemoteBoundedThreadHistoryResult {
  const outcome = parseFirstBoundedRead(
    body,
    boundedThreadSnapshotSchema,
    remoteThreadSnapshotSchema,
    "thread history",
  );
  if (outcome.negotiation === "bounded") {
    assertCompletedTurnsCursor(outcome.page.completedTurnsNextCursor);
  }
  return outcome;
}

export function parseBoundedHistoryItemsPage(
  body: unknown,
  strict: boolean,
): RemoteBoundedHistoryItemsResult {
  return strict
    ? {
        negotiation: "bounded",
        page: parseStrictBoundedRead(
          body,
          boundedRuntimeItemsPageSchema,
          "thread history items page",
        ),
      }
    : parseFirstBoundedRead(
        body,
        boundedRuntimeItemsPageSchema,
        remoteRuntimeItemsPageSchema,
        "thread history items page",
      );
}

export function parseBoundedTurnsPage(body: unknown): RemoteBoundedTurnsPage {
  const page = parseStrictBoundedRead(body, historyTurnPageSchema, "completed turns page");
  assertCompletedTurnsCursor(page.completedTurnsNextCursor);
  return page;
}

function assertMembershipSubset(
  returned: readonly string[],
  requested: readonly string[] | undefined,
  field: string,
): void {
  const requestedSet = new Set(requested ?? []);
  const seen = new Set<string>();
  for (const id of returned) {
    if (!requestedSet.has(id) || seen.has(id)) {
      throw boundedReadProtocolError(
        "membership_response_invalid",
        `The catalog membership answer returned ${field} ids that were not requested once.`,
      );
    }
    seen.add(id);
  }
}

export function parseBoundedMembershipResponse(
  body: unknown,
  request: CatalogMembershipRequest,
): CatalogMembershipResponse {
  const result = catalogMembershipResponseSchema.safeParse(body);
  if (!result.success) {
    throw boundedReadProtocolError(
      "bounded_response_invalid",
      "The catalog membership answer is missing required fields.",
      result.error,
    );
  }
  assertMembershipSubset(result.data.existingThreadIds, request.threadIds, "existingThreadIds");
  assertMembershipSubset(result.data.existingProjectIds, request.projectIds, "existingProjectIds");
  return result.data;
}

function boundedBudgetValue(declared: number | undefined, fallback: number, label: string): number {
  if (declared === undefined) return fallback;
  if (!Number.isSafeInteger(declared) || declared < 1) {
    throw invalidReadsRequest(`${label} must be a positive integer byte budget.`);
  }
  return declared;
}

/** Appends the two hard-budget params with honest default labels. */
export function appendRemoteBoundedReadBudget(
  search: URLSearchParams,
  budget: RemoteBoundedReadByteBudget,
): void {
  search.set(
    "maxBytes",
    String(
      boundedBudgetValue(budget.maxBytes, REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES, "maxBytes"),
    ),
  );
  search.set(
    "maxDecodeBytes",
    String(
      boundedBudgetValue(
        budget.maxDecodeBytes,
        REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        "maxDecodeBytes",
      ),
    ),
  );
}

export function boundedReadLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw invalidReadsRequest(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

export function boundedTimelineEntryCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = remoteTimelineEntryCountSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidReadsRequest("targetTimelineEntryCount must be an integer between 1 and 100.");
  }
  return parsed.data;
}

/**
 * Maps a definite host refusal on a declared bounded route to the matching
 * protocol error; every other failure is returned unchanged.
 */
export function mapBoundedReadRouteError(
  error: unknown,
  context: { readonly what: string; readonly declaredOnly: boolean },
): unknown {
  if (error instanceof RemoteClientError) {
    if (error.status === 400 && error.code === "invalid_reads_capability") {
      return boundedReadProtocolError(
        "route_unavailable",
        `The host does not serve the bounded ${context.what} route.`,
        error,
      );
    }
    if (
      error.status === 400 &&
      (error.code === "invalid_thread_cursor" || error.code === "invalid_project_cursor")
    ) {
      return boundedReadProtocolError(
        "cursor_mismatch",
        `The host rejected the bounded ${context.what} cursor; restart the bounded walk.`,
        error,
      );
    }
    if (context.declaredOnly && error.status === 404) {
      return boundedReadProtocolError(
        "route_unavailable",
        `The host predates the bounded ${context.what} route.`,
        error,
      );
    }
  }
  return error;
}

export async function performRemoteBoundedRead<T>(input: {
  readonly what: string;
  readonly declaredOnly: boolean;
  readonly send: () => Promise<unknown>;
  readonly parse: (body: unknown) => T;
}): Promise<T> {
  let body: unknown;
  try {
    body = await input.send();
  } catch (error) {
    throw mapBoundedReadRouteError(error, input);
  }
  return input.parse(body);
}
