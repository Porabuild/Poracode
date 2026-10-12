import { z } from "zod";
import {
  remoteProjectSchema,
  remoteShellSnapshotSchema,
  remoteThreadListPageSchema,
} from "./protocol";
import { CATALOG_READS_CAPABILITY } from "./catalogReadContract";

/**
 * Shared B4 bounded-catalog response schemas.
 *
 * These are the strict declared-client shapes the catalog page builders emit.
 * They live in the shared contract owner (not in `src/host`) so the generated
 * route registry and the host builders consume ONE definition; the host module
 * re-exports them instead of keeping a copy. Every bounded field is additive to
 * the canonical wire schemas, so a legacy response still parses through the
 * registry route schemas (`remoteShellSnapshotSchema` etc.).
 */

/** Bounded `thread-list` page: `nextCursor` plus the reads echo/frontier. */
export const boundedThreadListPageSchema = remoteThreadListPageSchema.extend({
  reads: z.literal(CATALOG_READS_CAPABILITY),
  inventoryFrontier: z.string().min(1).optional(),
});

/** Bounded `shell-snapshot`: both continuation cursors are always present. */
export const boundedShellSnapshotSchema = remoteShellSnapshotSchema.extend({
  reads: z.literal(CATALOG_READS_CAPABILITY),
  threadsNextCursor: z.string().min(1).nullable(),
  projectsNextCursor: z.string().min(1).nullable(),
});

/** Bounded `project-list` page (paint or inventory). */
export const catalogProjectListPageSchema = z.object({
  projects: z.array(remoteProjectSchema),
  projectsNextCursor: z.string().min(1).nullable(),
  reads: z.literal(CATALOG_READS_CAPABILITY),
  inventoryFrontier: z.string().min(1).optional(),
});

export type CatalogProjectListPage = z.infer<typeof catalogProjectListPageSchema>;
