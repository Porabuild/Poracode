import type { Project, ProjectScripts } from "./contracts";

/**
 * Recover settings while retiring another ID for the same folder. The original
 * project's non-empty choices win conflicts; missing settings and distinct
 * actions, MCP names, and search exclusions are recovered from the other row.
 * Coupled account, model, and worktree settings stay together as whole objects.
 * This is only for duplicate repair, never for ordinary settings updates.
 */
export function mergeProjectSettings(canonical: Project, duplicate: Project): Project {
  const merged = { ...canonical };
  for (const key of [
    "icon",
    "lastDraftConfig",
    "worktreeLocation",
    "ghAccount",
    "workspaceId",
  ] as const) {
    if (!hasSetting(canonical[key]) && hasSetting(duplicate[key])) {
      Object.assign(merged, { [key]: duplicate[key] });
    }
  }
  if (canonical.scripts || duplicate.scripts) {
    merged.scripts = mergeScripts(canonical.scripts, duplicate.scripts);
  }
  if (canonical.mcpServers || duplicate.mcpServers) {
    const servers = mergeEntries(canonical.mcpServers ?? [], duplicate.mcpServers ?? [], (server) =>
      server.name.toLowerCase(),
    );
    // Independently renamed copies can share a server ID. Editors use that ID,
    // so preserving both names also requires independent edit/delete targets.
    const ids = new Set<string>();
    merged.mcpServers = servers.map((server) => {
      let id = server.id;
      let suffix = 0;
      while (ids.has(id)) id = `${duplicate.id}:${server.id}:${suffix++}`;
      ids.add(id);
      return id === server.id ? server : { ...server, id };
    });
  }
  if (canonical.searchSettings || duplicate.searchSettings) {
    const primary = canonical.searchSettings;
    const fallback = duplicate.searchSettings;
    const useIgnoreFiles = primary?.useIgnoreFiles ?? fallback?.useIgnoreFiles;
    merged.searchSettings = {
      ...(useIgnoreFiles !== undefined ? { useIgnoreFiles } : {}),
      ...(primary?.exclude || fallback?.exclude
        ? { exclude: { ...fallback?.exclude, ...primary?.exclude } }
        : {}),
    };
  }
  return merged;
}

function mergeScripts(canonical?: ProjectScripts, duplicate?: ProjectScripts): ProjectScripts {
  const merged: ProjectScripts = {
    ...duplicate,
    ...canonical,
    actions: mergeEntries(
      canonical?.actions ?? [],
      duplicate?.actions ?? [],
      (action) => action.id,
    ),
  };
  for (const key of ["setupScript", "cleanupScript"] as const) {
    if (!hasSetting(canonical?.[key]) && hasSetting(duplicate?.[key])) {
      Object.assign(merged, { [key]: duplicate?.[key] });
    }
  }
  if (canonical?.worktreeCopyPatterns || duplicate?.worktreeCopyPatterns) {
    merged.worktreeCopyPatterns = [
      ...new Set([
        ...(canonical?.worktreeCopyPatterns ?? []),
        ...(duplicate?.worktreeCopyPatterns ?? []),
      ]),
    ];
  }
  return merged;
}

function mergeEntries<T>(
  canonical: readonly T[],
  duplicate: readonly T[],
  key: (entry: T) => string,
): T[] {
  const entries = new Map(canonical.map((entry) => [key(entry), entry]));
  for (const entry of duplicate) {
    if (!entries.has(key(entry))) entries.set(key(entry), entry);
  }
  return [...entries.values()];
}

function hasSetting(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.values(value).some(hasSetting);
  return true;
}
