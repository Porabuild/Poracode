import { dbGetProject } from "@/host/db";
import { dbGetMemoryEntry } from "@/host/db/memoryStore";
import { isHomeProjectId } from "@/shared/homeScope";
import {
  remoteMemoryCatalogResultSchema,
  type RemoteMemoryCatalogCommand,
  type RemoteMemoryCatalogResult,
} from "@/shared/memory";
import { msg } from "@/shared/messages";
import { listScopedMemoryEntriesForProject } from "./apply";
import { handleMemoryCommand } from "./runtime";

export class MemoryCatalogError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function runMemoryCatalogCommand(
  command: RemoteMemoryCatalogCommand,
): Promise<RemoteMemoryCatalogResult> {
  const projectId =
    command.action === "save"
      ? command.entry.projectId
      : "projectId" in command
        ? command.projectId
        : undefined;
  if (projectId && !dbGetProject(projectId)) {
    throw new MemoryCatalogError("project_not_found", msg("remote.project.notFound"), 404);
  }
  if (command.action === "save") {
    const { entry } = command;
    const current = entry.id ? dbGetMemoryEntry(entry.id) : undefined;
    if (entry.id && !current) {
      throw new MemoryCatalogError("memory_not_found", "Memory not found.", 404);
    }
    if (current && (current.scope !== entry.scope || current.projectId !== (projectId ?? null))) {
      throw new MemoryCatalogError("memory_scope_conflict", "The memory scope has changed.", 409);
    }
    if (
      (entry.scope === "global" && (projectId || entry.category === "project")) ||
      (entry.scope === "project" && !current && (!projectId || isHomeProjectId(projectId)))
    ) {
      throw new MemoryCatalogError("invalid_memory_scope", "Choose a valid memory scope.", 400);
    }
  }
  if (
    command.action === "delete" &&
    projectId &&
    dbGetMemoryEntry(command.id) &&
    !listScopedMemoryEntriesForProject(projectId).some((entry) => entry.id === command.id)
  ) {
    throw new MemoryCatalogError("memory_not_found", "Memory not found.", 404);
  }
  return remoteMemoryCatalogResultSchema.parse({
    action: command.action,
    result: await handleMemoryCommand(command),
  });
}
