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

export function parseWslUncPath(uncPath: string): { distro: string; linuxPath: string } | null {
  const match = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.+)$/i.exec(uncPath);
  if (!match) return null;
  const distro = match[1]!;
  const linuxPath = "/" + match[2]!.replace(/\\/g, "/");
  return { distro, linuxPath };
}

export function getProjectDisplayPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return `${location.distro}:${location.linuxPath}`;
  return location.path;
}

export function getProjectName(location: ProjectLocation): string {
  const rawPath = location.kind === "wsl" ? location.linuxPath : location.path;
  const segments = rawPath.split(/[\\/]/g).filter(Boolean);
  return segments.at(-1) ?? rawPath;
}
