import { useEffect } from "react";
import type { Project } from "@/shared/contracts";
import {
  ensureProjectMcpServersLoaded,
  isProjectMcpServersLoaded,
} from "@/renderer/state/projectSettings/projectSettingsLoader";

/**
 * Keeps a project's private MCP settings resident for a surface that lists
 * them. Catalog rows (managed-root desktop, paired mirrors) arrive without
 * `mcpServers`, so "not loaded" must never read as "configured empty". A failed
 * read leaves the row unloaded; display surfaces fall back to Global servers
 * and the host still launches from its own authoritative configuration.
 */
export function useResidentProjectMcpServers(project: Project | undefined): void {
  useEffect(() => {
    if (!project || isProjectMcpServersLoaded(project)) return;
    void ensureProjectMcpServersLoaded(project.id).catch(() => undefined);
  }, [project]);
}
