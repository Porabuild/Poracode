import type { TaxonomyCase } from "./types";
import { READ_PAYLOAD_CASES } from "./payload-read";
import { FILE_PAYLOAD_CASES } from "./payload-files";
import { TOOL_PAYLOAD_CASES, TOOL_ERROR_CASE } from "./payload-tools";
import { MEDIA_PAYLOAD_CASES } from "./media-cases";
import { DELEGATION_PAYLOAD_CASES } from "./delegation";
import { WORKFLOW_PAYLOAD_CASES } from "./workflow";
import { CONTROL_PAYLOAD_CASES } from "./control-states";

/** Representative bodies linked one-to-one with the inventory's item proposals. */
export const PAYLOAD_CASES: readonly TaxonomyCase[] = [
  ...READ_PAYLOAD_CASES,
  ...FILE_PAYLOAD_CASES,
  ...TOOL_PAYLOAD_CASES,
  ...MEDIA_PAYLOAD_CASES,
  TOOL_ERROR_CASE,
  ...DELEGATION_PAYLOAD_CASES,
  ...WORKFLOW_PAYLOAD_CASES,
  ...CONTROL_PAYLOAD_CASES,
].map((c) => ({
  ...c,
  inventoryIds: c.inventoryIds.length ? c.inventoryIds : c.id === "goal_dock" ? [] : [c.id],
}));
