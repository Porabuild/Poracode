import type { Project } from "@/shared/contracts";

export function formatProjectLocation(project: Project): string {
  if (project.location.kind === "wsl") {
    return `${project.location.distro}:${project.location.linuxPath}`;
  }
  if (project.location.kind === "ssh") {
    return `${project.location.host}:${project.location.path}`;
  }
  return project.location.path;
}
