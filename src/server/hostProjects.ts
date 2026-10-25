import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  dbGetProjects,
  dbFindProjectByLocation,
  dbUpsertProject,
  dbUpdateProject,
  dbReadCatalogProjectPhase1,
  dbReadCatalogProjectSummaries,
} from "@/host/db";
import { registerExistingProjectDirectory } from "@/host/remote/projectCommands";
import { encodeCatalogInventoryCursor } from "@/shared/remote/catalogReadContract";
import {
  HOST_PROJECT_INVENTORY_VERSION,
  hostProjectCommandSchema,
  hostProjectSummarySchema,
  type HostProjectCommand,
} from "@/shared/contracts/hostProjects";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";

const hostPorts = {
  page: dbReadCatalogProjectPhase1,
  summaries: dbReadCatalogProjectSummaries,
  stat,
  registration: {
    getProjects: dbGetProjects,
    findProjectByLocation: dbFindProjectByLocation,
    upsertProject: dbUpsertProject,
    updateProject: dbUpdateProject,
    platform: process.platform,
    now: () => new Date().toISOString(),
  },
};

type HostProjectPorts = Omit<typeof hostPorts, "stat"> & {
  stat(path: string): Promise<{ isDirectory(): boolean }>;
};

export async function administerProject(
  input: HostProjectCommand,
  context: HostControlContext,
  ports: HostProjectPorts = hostPorts,
) {
  context.assertActive();
  const command = hostProjectCommandSchema.parse(input);
  const metadata = { formatVersion: HOST_PROJECT_INVENTORY_VERSION, scope: "persisted-profile" };
  if (command.action === "projects-list") {
    const page = ports.page({
      mode: "inventory",
      limit: command.limit,
      ...(command.cursor ? { cursor: command.cursor } : {}),
    });
    const projects = ports
      .summaries(page.rows.map((row) => row.id))
      .map((row) => hostProjectSummarySchema.parse(row));
    const last = page.rows.at(-1);
    if (page.moreBeyondWindow && (!last || page.frontier === undefined))
      throw new Error("Project inventory cursor is unavailable. Retry projects list.");
    context.assertActive();
    return {
      ...metadata,
      projects,
      nextCursor:
        page.moreBeyondWindow && last
          ? encodeCatalogInventoryCursor("project", { id: last.id, frontier: page.frontier! })
          : null,
    };
  }
  if (command.action === "projects-inspect") {
    const project = ports.summaries([command.projectId])[0];
    if (!project || project.id !== command.projectId)
      throw new Error(
        "Project not found in this profile. Run projects list with the same --base-dir.",
      );
    return { ...metadata, project: hostProjectSummarySchema.parse(project) };
  }
  if (!isAbsolute(command.path))
    throw new Error(
      "Project paths must be absolute paths on this host. No project was registered.",
    );
  if (!(await ports.stat(command.path)).isDirectory())
    throw new Error("Choose an existing directory on this host. No project was registered.");
  context.assertActive();
  const result = registerExistingProjectDirectory(
    { kind: "add-existing", path: command.path, ...(command.name ? { name: command.name } : {}) },
    ports.registration,
    { resultMode: "bounded", onEffectBoundary: context.assertActive },
  );
  if (
    result.kind !== "bounded" ||
    !result.response.project ||
    typeof result.response.created !== "boolean"
  )
    throw new Error(
      "Project registration did not return its persisted identity. Inspect projects list before retrying.",
    );
  const project = result.response.project;
  return {
    ...metadata,
    created: result.response.created,
    project: hostProjectSummarySchema.parse({
      id: project.id,
      name: project.name,
      location: project.location,
      disabled: project.disabled === true,
      createdAt: project.createdAt,
    }),
  };
}
