/**
 * Menu keys for the workspace surfaces. `ContextMenu` and `OptionMenu` are
 * key-string APIs with a single `onAction`/`onChange`, so workspace choices have
 * to be encoded into ids — building and parsing them here keeps the encoding in
 * one place instead of letting each menu invent its own prefix.
 */

const WORKSPACE_KEY_PREFIX = "workspace:";

/** "Unfiled" — belongs to no workspace, so it shows in all of them. */
export const WORKSPACE_UNFILED_KEY = "workspace:unfiled";

export function workspaceMenuKey(workspaceId: string): string {
  return `${WORKSPACE_KEY_PREFIX}${workspaceId}`;
}

export type WorkspaceMenuSelection =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "unfiled" };

/** Returns null for keys owned by another namespace (e.g. `action:` entries). */
export function parseWorkspaceMenuKey(key: string): WorkspaceMenuSelection | null {
  if (key === WORKSPACE_UNFILED_KEY) return { kind: "unfiled" };
  if (!key.startsWith(WORKSPACE_KEY_PREFIX)) return null;
  return { kind: "workspace", workspaceId: key.slice(WORKSPACE_KEY_PREFIX.length) };
}
