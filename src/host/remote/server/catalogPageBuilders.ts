import type { Thread } from "@/shared/contracts";
import {
  CATALOG_READS_CAPABILITY,
  encodeCatalogInventoryCursor,
  encodeCatalogProjectPaintCursor,
  encodeCatalogThreadPaintCursor,
  type CatalogPaintOrder,
} from "@/shared/remote/catalogReadContract";
import type { RemoteShellSnapshot, RemoteThreadListPage } from "@/shared/remote";
import {
  boundedShellSnapshotSchema,
  boundedThreadListPageSchema,
  catalogProjectListPageSchema,
} from "@/shared/remote/catalogReadSchemas";
import { dbGetThreadRuntimeSummariesCommitted } from "@/host/db";
import {
  dbReadCatalogProjectPhase1,
  dbReadCatalogProjectPhase2,
  dbReadCatalogThreadPhase1,
  dbReadCatalogThreadPhase2,
  type CatalogPageRowMeta,
} from "@/host/db/catalogReads";
import {
  CatalogItemTooLargeError,
  buildCatalogItemTooLargeBody,
  catalogLowerBoundProvesOversized,
  catalogSizesFit,
  catalogUpperBoundWithinCaps,
  measureCatalogBody,
  packCatalogRowsWithinSoftTarget,
  serializeCatalogRowsWithinExactCaps,
  type CatalogEffectiveCaps,
  type CatalogSizes,
} from "./catalogPageBudget";
import type { RemoteServerContext } from "./context";
import { RemoteHttpError } from "../auth";
import { projectGitStateSnapshotForRemote } from "./gitStateProjection";
import { withStableUpdatedAt } from "./stableUpdatedAt";

export interface CatalogReadNegotiation {
  readonly declared: boolean;
  readonly order: CatalogPaintOrder;
  readonly mode: "page" | "inventory";
  /** Thread page size (`limit` / `threadLimit`). */
  readonly limit: number;
  /** Project page size (`projectLimit`). */
  readonly projectLimit: number;
  readonly summaries: boolean;
  readonly caps: CatalogEffectiveCaps;
}

// The strict bounded response schemas live in the shared contract owner
// (`@/shared/remote/catalogReadSchemas`); re-exported here so host consumers and
// tests keep their import surface without a second definition.
export {
  boundedShellSnapshotSchema,
  boundedThreadListPageSchema,
  catalogProjectListPageSchema,
  type CatalogProjectListPage,
} from "@/shared/remote/catalogReadSchemas";

function runtimeSummariesFor(
  threads: readonly Thread[],
): RemoteShellSnapshot["runtimeSummariesByThread"] {
  const visibleThreads = threads.filter((thread) => !thread.archived);
  const runtimeSummaries = dbGetThreadRuntimeSummariesCommitted(
    visibleThreads.map((thread) => thread.id),
  );
  const summariesByThread: RemoteShellSnapshot["runtimeSummariesByThread"] = {};
  for (const thread of visibleThreads) {
    const summary = runtimeSummaries[thread.id] ?? { itemCount: 0 };
    summariesByThread[thread.id] = {
      itemCount: summary.itemCount,
      ...(summary.latestItemId ? { latestItemId: summary.latestItemId } : {}),
      ...(summary.latestItemType ? { latestItemType: summary.latestItemType } : {}),
      ...(summary.latestItemState ? { latestItemState: summary.latestItemState } : {}),
      ...(summary.contextUsage ? { contextUsage: summary.contextUsage } : {}),
    };
  }
  return summariesByThread;
}

function gitSummariesFor(
  ctx: RemoteServerContext,
  threads: readonly Thread[],
): RemoteShellSnapshot["gitSummariesByThread"] {
  const all = ctx.options.gitSummaries?.() ?? {};
  const ids = new Set(threads.map((thread) => thread.id));
  const sliced: NonNullable<RemoteShellSnapshot["gitSummariesByThread"]> = {};
  for (const [threadId, summary] of Object.entries(all)) {
    if (ids.has(threadId)) sliced[threadId] = summary;
  }
  return sliced;
}

/**
 * Phase-1 pre-fetch refusal, proven — never estimated. The conservative upper
 * bound decides nothing beyond "the exact measurement may be needed": only the
 * sound lower bound (the exact escaped size of raw string columns the wire
 * schema emits verbatim) can refuse a row before its payload is fetched. A row
 * whose upper bound exceeds a cap but whose lower bound does not is fetched and
 * measured exactly by phase 2; a JSON column projected by the schema has no
 * lower-bound proof and is therefore never refused pre-fetch.
 */
function refuseOversizedBound(
  resource: "thread" | "project",
  row: CatalogPageRowMeta,
  caps: CatalogEffectiveCaps,
): void {
  const upper: CatalogSizes = {
    wireBytes: row.boundWireBytes,
    decodeBytes: row.boundWireBytes * 2,
  };
  if (catalogUpperBoundWithinCaps(upper, caps)) return;
  const lower: CatalogSizes = {
    wireBytes: row.lowerBoundWireBytes,
    decodeBytes: row.lowerBoundDecodeBytes,
  };
  if (!catalogLowerBoundProvesOversized(lower, caps)) return;
  throw new CatalogItemTooLargeError(
    buildCatalogItemTooLargeBody({
      resource,
      id: row.id,
      sizes: upper,
      caps,
      measurement: "serialized-upper-bound",
      lowerBoundSizes: lower,
    }),
  );
}

function threadContinuationCursor(input: {
  readonly mode: "page" | "inventory";
  readonly order: CatalogPaintOrder;
  readonly last: CatalogPageRowMeta;
  readonly frontier: string | undefined;
}): string {
  if (input.mode === "inventory") {
    if (input.frontier === undefined) {
      throw new RemoteHttpError(
        "invalid_thread_cursor",
        "The inventory cursor is missing its frontier.",
        400,
      );
    }
    return encodeCatalogInventoryCursor("thread", { id: input.last.id, frontier: input.frontier });
  }
  switch (input.order) {
    case "manual":
      return encodeCatalogThreadPaintCursor({
        order: "manual",
        sortOrder: input.last.sortOrder,
        id: input.last.id,
      });
    case "updated":
      return encodeCatalogThreadPaintCursor({
        order: "updated",
        updatedAt: input.last.updatedAt,
        id: input.last.id,
      });
    case "created":
      return encodeCatalogThreadPaintCursor({
        order: "created",
        createdAt: input.last.createdAt,
        id: input.last.id,
      });
  }
}

export function buildCatalogThreadListPage(
  ctx: RemoteServerContext,
  negotiation: CatalogReadNegotiation,
  cursor: string | undefined,
): string {
  const caps = negotiation.caps;
  const phase1 = dbReadCatalogThreadPhase1({
    mode: negotiation.mode,
    order: negotiation.order,
    limit: negotiation.limit,
    ...(cursor !== undefined ? { cursor } : {}),
  });
  const pack = packCatalogRowsWithinSoftTarget(
    phase1.rows,
    negotiation.limit,
    caps.softPackWireBytes,
  );
  const hasMore = pack.hasMore || phase1.moreBeyondWindow;
  const first = pack.packed[0];
  if (first !== undefined) refuseOversizedBound("thread", first, caps);
  const threads = dbReadCatalogThreadPhase2(pack.packed.map((row) => row.id));
  const last = pack.packed.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? threadContinuationCursor({
          mode: negotiation.mode,
          order: negotiation.order,
          last,
          frontier: phase1.frontier,
        })
      : null;
  const envelope = {
    reads: CATALOG_READS_CAPABILITY,
    nextCursor,
    ...(negotiation.mode === "inventory" && cursor === undefined && phase1.frontier !== undefined
      ? { inventoryFrontier: phase1.frontier }
      : {}),
  };
  const serialize = (rows: readonly Thread[]): string =>
    `${JSON.stringify(
      boundedThreadListPageSchema.parse({
        ...envelope,
        threads: rows,
        runtimeSummariesByThread: negotiation.summaries
          ? runtimeSummariesFor(rows)
          : ({} as RemoteThreadListPage["runtimeSummariesByThread"]),
        gitSummariesByThread: gitSummariesFor(ctx, rows),
      }),
    )}\n`;
  return serializeCatalogRowsWithinExactCaps({
    rows: threads,
    serialize,
    caps,
    onOversized: (thread, sizes) =>
      new CatalogItemTooLargeError(
        buildCatalogItemTooLargeBody({
          resource: "thread",
          id: thread.id,
          sizes,
          caps,
          measurement: "serialized-exact",
        }),
      ),
    onEnvelopeOversized: (sizes) => catalogEnvelopeTooLarge(sizes, caps),
  }).body;
}

export function buildCatalogProjectListPage(
  ctx: RemoteServerContext,
  negotiation: CatalogReadNegotiation,
  cursor: string | undefined,
): string {
  const caps = negotiation.caps;
  const phase1 = dbReadCatalogProjectPhase1({
    mode: negotiation.mode,
    limit: negotiation.projectLimit,
    ...(cursor !== undefined ? { cursor } : {}),
  });
  const pack = packCatalogRowsWithinSoftTarget(
    phase1.rows,
    negotiation.projectLimit,
    caps.softPackWireBytes,
  );
  const hasMore = pack.hasMore || phase1.moreBeyondWindow;
  const first = pack.packed[0];
  if (first !== undefined) refuseOversizedBound("project", first, caps);
  const projects = dbReadCatalogProjectPhase2(pack.packed.map((row) => row.id));
  const last = pack.packed.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? negotiation.mode === "inventory"
        ? phase1.frontier === undefined
          ? throwMissingProjectFrontier()
          : encodeCatalogInventoryCursor("project", { id: last.id, frontier: phase1.frontier })
        : encodeCatalogProjectPaintCursor({ sortOrder: last.sortOrder, id: last.id })
      : null;
  const envelope = {
    reads: CATALOG_READS_CAPABILITY,
    projectsNextCursor: nextCursor,
    ...(negotiation.mode === "inventory" && cursor === undefined && phase1.frontier !== undefined
      ? { inventoryFrontier: phase1.frontier }
      : {}),
  };
  const serialize = (rows: readonly (typeof projects)[number][]): string =>
    `${JSON.stringify(catalogProjectListPageSchema.parse({ ...envelope, projects: rows }))}\n`;
  return serializeCatalogRowsWithinExactCaps({
    rows: projects,
    serialize,
    caps,
    onOversized: (project, sizes) =>
      new CatalogItemTooLargeError(
        buildCatalogItemTooLargeBody({
          resource: "project",
          id: project.id,
          sizes,
          caps,
          measurement: "serialized-exact",
        }),
      ),
    onEnvelopeOversized: (sizes) => catalogEnvelopeTooLarge(sizes, caps),
  }).body;
}

export function buildCatalogShellSnapshotPage(
  ctx: RemoteServerContext,
  negotiation: CatalogReadNegotiation,
): string {
  const caps = negotiation.caps;
  const threadPhase1 = dbReadCatalogThreadPhase1({
    mode: "page",
    order: negotiation.order,
    limit: negotiation.limit,
  });
  const threadPack = packCatalogRowsWithinSoftTarget(
    threadPhase1.rows,
    negotiation.limit,
    caps.softPackWireBytes,
  );
  const threadFirst = threadPack.packed[0];
  if (threadFirst !== undefined) refuseOversizedBound("thread", threadFirst, caps);
  const projectPhase1 = dbReadCatalogProjectPhase1({
    mode: "page",
    limit: negotiation.projectLimit,
  });
  const projectPack = packCatalogRowsWithinSoftTarget(
    projectPhase1.rows,
    negotiation.projectLimit,
    caps.softPackWireBytes,
  );
  const projectFirst = projectPack.packed[0];
  if (projectFirst !== undefined) refuseOversizedBound("project", projectFirst, caps);

  const threads = dbReadCatalogThreadPhase2(threadPack.packed.map((row) => row.id));
  const projects = dbReadCatalogProjectPhase2(projectPack.packed.map((row) => row.id));
  const threadsMore = threadPack.hasMore || threadPhase1.moreBeyondWindow;
  const projectsMore = projectPack.hasMore || projectPhase1.moreBeyondWindow;
  const snapshotSeq = ctx.seq;
  const gitState = ctx.options.gitState
    ? projectGitStateSnapshotForRemote(ctx.options.gitState.getSnapshot())
    : undefined;

  const buildPayload = (
    threadSlice: readonly Thread[],
    projectSlice: typeof projects,
  ): RemoteShellSnapshot =>
    boundedShellSnapshotSchema.parse(
      withStableUpdatedAt("shell", {
        snapshotSeq,
        reads: CATALOG_READS_CAPABILITY,
        projects: projectSlice,
        threads: threadSlice,
        threadsNextCursor:
          threadSlice.length > 0 && (threadsMore || threadSlice.length < threads.length)
            ? threadContinuationCursor({
                mode: "page",
                order: negotiation.order,
                last: threadPack.packed[threadSlice.length - 1]!,
                frontier: undefined,
              })
            : null,
        projectsNextCursor:
          projectSlice.length > 0 && (projectsMore || projectSlice.length < projects.length)
            ? encodeCatalogProjectPaintCursor({
                sortOrder: projectPack.packed[projectSlice.length - 1]!.sortOrder,
                id: projectPack.packed[projectSlice.length - 1]!.id,
              })
            : null,
        runtimeSummariesByThread: negotiation.summaries
          ? runtimeSummariesFor(threadSlice)
          : ({} as RemoteShellSnapshot["runtimeSummariesByThread"]),
        gitSummariesByThread: gitSummariesFor(ctx, threadSlice),
        ...(gitState ? { gitState } : {}),
      }),
    );

  const serialize = (threadCount: number, projectCount: number): string =>
    `${JSON.stringify(buildPayload(threads.slice(0, threadCount), projects.slice(0, projectCount)))}\n`;
  const fits = (threadCount: number, projectCount: number): boolean =>
    catalogSizesFit(measureCatalogBody(serialize(threadCount, projectCount)), caps);

  const threadCount = threads.length;
  const projectCount = projects.length;
  if (fits(threadCount, projectCount)) return serialize(threadCount, projectCount);
  if (!fits(0, 0)) throw catalogEnvelopeTooLarge(measureCatalogBody(serialize(0, 0)), caps);

  if (threadCount > 0) {
    if (!fits(1, 0)) {
      throw threadOversized(threadPack.packed[0]!, measureCatalogBody(serialize(1, 0)), caps);
    }
    const threadsBest = maxFittingCount(1, threadCount, (count) => fits(count, projectCount));
    if (threadsBest !== null) return serialize(threadsBest, projectCount);
    if (projectCount === 0) return serialize(1, 0);
    // A single thread fits but no project fits alongside it. Never drop a whole
    // section silently: refuse the project explicitly instead.
    const projectsWithOneThread = maxFittingCount(1, projectCount, (count) => fits(1, count));
    if (projectsWithOneThread === null) {
      throw projectOversized(projectPack.packed[0]!, measureCatalogBody(serialize(1, 1)), caps);
    }
    return serialize(1, projectsWithOneThread);
  }

  const projectsBest = maxFittingCount(1, projectCount, (count) => fits(0, count));
  if (projectsBest === null) {
    throw projectOversized(projectPack.packed[0]!, measureCatalogBody(serialize(0, 1)), caps);
  }
  return serialize(0, projectsBest);
}

/** Largest count in `[low, high]` satisfying `fits`; null when even `low`
 * fails. `fits` must be monotone non-increasing in the count. */
function maxFittingCount(
  low: number,
  high: number,
  fits: (count: number) => boolean,
): number | null {
  if (high < low) return null;
  if (!fits(low)) return null;
  let best = low;
  let currentLow = low;
  let currentHigh = high;
  while (currentLow <= currentHigh) {
    const mid = Math.floor((currentLow + currentHigh) / 2);
    if (fits(mid)) {
      best = mid;
      currentLow = mid + 1;
    } else {
      currentHigh = mid - 1;
    }
  }
  return best;
}

function catalogEnvelopeTooLarge(
  sizes: { wireBytes: number; decodeBytes: number },
  caps: CatalogEffectiveCaps,
): RemoteHttpError {
  return new RemoteHttpError(
    "read_response_too_large",
    `The catalog response envelope cannot fit the negotiated caps ` +
      `(wire ${sizes.wireBytes}/${caps.maxWireBytes}, decode ${sizes.decodeBytes}/${caps.maxDecodeBytes}).`,
    503,
  );
}

function threadOversized(
  row: CatalogPageRowMeta,
  sizes: { wireBytes: number; decodeBytes: number },
  caps: CatalogEffectiveCaps,
): CatalogItemTooLargeError {
  return new CatalogItemTooLargeError(
    buildCatalogItemTooLargeBody({
      resource: "thread",
      id: row.id,
      sizes,
      caps,
      measurement: "serialized-exact",
    }),
  );
}

function projectOversized(
  row: CatalogPageRowMeta,
  sizes: { wireBytes: number; decodeBytes: number },
  caps: CatalogEffectiveCaps,
): CatalogItemTooLargeError {
  return new CatalogItemTooLargeError(
    buildCatalogItemTooLargeBody({
      resource: "project",
      id: row.id,
      sizes,
      caps,
      measurement: "serialized-exact",
    }),
  );
}

function throwMissingProjectFrontier(): never {
  throw new RemoteHttpError(
    "invalid_project_cursor",
    "The inventory cursor is missing its frontier.",
    400,
  );
}
