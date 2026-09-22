/**
 * Host import surface for the strict bounded-history response schemas. The one
 * definition lives in the shared contract owner
 * (`@/shared/remote/historyReadSchemas`); this module only re-exports it so no
 * host copy can drift from the generated contract.
 */
export {
  boundedRuntimeItemsPageSchema,
  boundedThreadSnapshotSchema,
} from "@/shared/remote/historyReadSchemas";
