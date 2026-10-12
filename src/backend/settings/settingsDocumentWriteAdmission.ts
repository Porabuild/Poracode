import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { msg } from "@/shared/messages";
import {
  decodeSettingsDocument,
  parseSettingsDocument,
  SettingsDocumentError,
} from "./settingsDocument";
import { assertSettingsSelectionDataReplaceable } from "./settingsSelectionData";

/**
 * Recheck authoritative disk data under the caller's live custody at each
 * persistence checkpoint. The existing committed document is the comparison
 * baseline; no projected snapshot can authorize erasing unsupported metadata.
 */
export function assertSettingsDocumentWriteAdmission(
  path: string,
  committedRaw: Record<string, unknown>,
): void {
  assertSettingsSelectionDataReplaceable(committedRaw);
  let current;
  try {
    current = parseSettingsDocument(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    current = decodeSettingsDocument({});
  }
  assertSettingsSelectionDataReplaceable(current.raw);
  if (!isDeepStrictEqual(current.raw, committedRaw))
    throw new SettingsDocumentError("corrupt", msg("settings.dataNotPrepared"));
}
