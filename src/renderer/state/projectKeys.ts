import type { Project, ProjectLocation } from "@/shared/contracts";

function buildProjectLocationKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
    case "posix":
      return `${location.kind}:${location.path}`;
    case "wsl":
      return `${location.kind}:${location.distro}:${location.linuxPath}:${location.uncPath}`;
    case "ssh":
      return `${location.kind}:${location.host}:${location.path}`;
  }
}

export function buildActiveProjectsKey(projects: readonly Project[]): string {
  return projects
    .filter((project) => !project.disabled)
    .map((project) => `${project.id}:${buildProjectLocationKey(project.location)}`)
    .sort()
    .join("|");
}

export function buildWslProjectDistrosKey(projects: readonly Project[]): string {
  return [
    ...new Set(
      projects.flatMap((project) =>
        project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ]
    .sort()
    .join("\0");
}

export function parseWslProjectDistrosKey(key: string): string[] {
  return key ? key.split("\0") : [];
}

export function buildSshProjectLocationsKey(projects: readonly Project[]): string {
  return JSON.stringify(
    projects
      .flatMap((project) =>
        project.location.kind === "ssh" && !project.disabled
          ? [{ kind: "ssh" as const, host: project.location.host, path: project.location.path }]
          : [],
      )
      .sort((a, b) => `${a.host}:${a.path}`.localeCompare(`${b.host}:${b.path}`)),
  );
}

export function parseSshProjectLocationsKey(
  key: string,
): Extract<ProjectLocation, { kind: "ssh" }>[] {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Extract<ProjectLocation, { kind: "ssh" }> =>
        entry != null &&
        typeof entry === "object" &&
        (entry as { kind?: unknown }).kind === "ssh" &&
        typeof (entry as { host?: unknown }).host === "string" &&
        typeof (entry as { path?: unknown }).path === "string",
    );
  } catch {
    return [];
  }
}
