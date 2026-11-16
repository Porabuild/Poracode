import { z } from "zod";
import {
  runtimeItemPresentationEntrySchema,
  runtimeToolPresentationEntrySchema,
  runtimeToolBodyEntrySchema,
} from "./runtimeItemPresentation";

/** Read-only hints beside a complete, canonical transient transcript. Each
 * entry carries the same input digest as the persisted-item advisory read. */
export const RUNTIME_ITEM_PRESENTATION_SNAPSHOT_VERSION = 1 as const;
export const RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_ITEMS = 4096;
export const RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const runtimeItemPresentationSnapshotSchema = z.object({
  version: z.literal(RUNTIME_ITEM_PRESENTATION_SNAPSHOT_VERSION),
  items: z
    .array(
      z.discriminatedUnion("version", [
        z.object({ version: z.literal(1), entry: runtimeItemPresentationEntrySchema }),
        z.object({ version: z.literal(2), entry: runtimeToolPresentationEntrySchema }),
        z.object({ version: z.literal(5), entry: runtimeToolBodyEntrySchema }),
      ]),
    )
    .max(RUNTIME_ITEM_PRESENTATION_SNAPSHOT_MAX_ITEMS),
});
export type RuntimeItemPresentationSnapshot = z.infer<typeof runtimeItemPresentationSnapshotSchema>;

/** Future formats are preserved as opaque advisory data. They never invalidate
 * the complete event snapshot or become an instruction to alter its payload. */
export const runtimeItemPresentationSnapshotSlotSchema = z.union([
  runtimeItemPresentationSnapshotSchema,
  z.record(z.string(), z.unknown()),
]);
