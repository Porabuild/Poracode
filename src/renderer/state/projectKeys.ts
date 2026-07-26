import type { Project, ProjectLocation } from "@/shared/contracts";

function buildProjectLocationKey(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
    case "posix":
      return `${location.kind}:${location.path}`;
    case "wsl":
      return `${location.kind}:${location.distro}:${location.linuxPath}:${location.uncPath}`;
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
        !project.disabled && project.location.kind === "wsl" ? [project.location.distro] : [],
      ),
    ),
  ]
    .sort()
    .join("\0");
}

export function parseWslProjectDistrosKey(key: string): string[] {
  return key ? key.split("\0") : [];
}
