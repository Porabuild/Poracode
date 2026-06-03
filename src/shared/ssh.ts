import type { ProjectLocation } from "./contracts";

export type SshProjectLocation = Extract<ProjectLocation, { kind: "ssh" }>;

export function isSafeSshHost(host: string): boolean {
  return (
    host.length > 0 &&
    !host.startsWith("-") &&
    !/\s/.test(host) &&
    !host.includes(String.fromCharCode(0))
  );
}

export function formatSshProjectLocation(location: SshProjectLocation): string {
  return `${location.host}:${location.path}`;
}

export function parseSshProjectSpec(input: string): SshProjectLocation | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("ssh://")) {
    try {
      const url = new URL(raw);
      if (url.port) return null;
      const username = url.username ? `${decodeURIComponent(url.username)}@` : "";
      const host = `${username}${url.hostname}`;
      const path = decodeURIComponent(url.pathname);
      if (!isSafeSshHost(host) || !path.startsWith("/")) return null;
      return { kind: "ssh", host, path: normalizeSshPath(path) };
    } catch {
      return null;
    }
  }

  const separator = raw.indexOf(":");
  if (separator <= 0) return null;
  const host = raw.slice(0, separator).trim();
  const path = raw.slice(separator + 1).trim();
  if (!isSafeSshHost(host) || !path.startsWith("/")) return null;
  return { kind: "ssh", host, path: normalizeSshPath(path) };
}

function normalizeSshPath(path: string): string {
  const normalized = path.replace(/\/+$/g, "");
  return normalized || "/";
}
