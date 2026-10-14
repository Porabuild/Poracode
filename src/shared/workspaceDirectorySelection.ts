import { z } from "zod";
import { projectLocationSchema } from "./contracts/common";

/** Structural admission only. Runtime owns canonical paths, environment and filesystem checks. */
export const MAX_WORKSPACE_DIRECTORY_ENTRIES = 16;
export const MAX_WORKSPACE_EXECUTION_PATH_CHARS = 4_096;
export const MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS = 32_768;

const executionPath = z.string().min(1).max(MAX_WORKSPACE_EXECUTION_PATH_CHARS);
export const workspaceDirectoryLocationSchema = z.discriminatedUnion("kind", [
  projectLocationSchema.options[0].extend({ path: executionPath }),
  projectLocationSchema.options[1].extend({ linuxPath: executionPath }),
  projectLocationSchema.options[2].extend({ path: executionPath }),
]);

/** Complete ordered replacement; bounds apply before any future canonical deduplication. */
// Read projection uses portable schema keywords for the existing native generators.
// The host admission/parser below additionally enforces the aggregate serialized bound.
export const workspaceDirectoryProjectionSchema = z
  .array(workspaceDirectoryLocationSchema)
  .max(MAX_WORKSPACE_DIRECTORY_ENTRIES);
export const workspaceDirectorySelectionSchema = workspaceDirectoryProjectionSchema.refine(
  (locations) => JSON.stringify(locations).length <= MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS,
  "Workspace directory selection exceeds serialized character limit",
);

export const workspaceGrantRevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Refuse corrupt persisted authorization; never recover it as an empty grant. */
export function parseSavedWorkspaceDirectories(serialized: string) {
  if (
    typeof serialized !== "string" ||
    serialized.length > MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS
  ) {
    throw new Error("Invalid saved workspace directory selection");
  }
  return workspaceDirectorySelectionSchema.parse(JSON.parse(serialized));
}
