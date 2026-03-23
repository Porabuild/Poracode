import type { ProjectLocation } from "./contracts";

export function stripNulChars(value: string): string {
  return value.split("\0").join("");
}

export function normalizeWslListOutput(raw: string): string[] {
  return stripNulChars(raw)
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toWslUncPath(distro: string, linuxPath: string): string {
  const normalizedLinuxPath = linuxPath.replace(/^\/+/, "").replace(/\//g, "\\");
  return `\\\\wsl.localhost\\${distro}\\${normalizedLinuxPath}`;
}

export function getProjectDisplayPath(location: ProjectLocation): string {
  return location.kind === "windows" ? location.path : `${location.distro}:${location.linuxPath}`;
}

export function getProjectName(location: ProjectLocation): string {
  const rawPath = location.kind === "windows" ? location.path : location.linuxPath;
  const segments = rawPath.split(/[\\/]/g).filter(Boolean);
  return segments.at(-1) ?? rawPath;
}
