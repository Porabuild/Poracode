import { msg } from "@/shared/messages";
import {
  forgeAccountRefSchema,
  type ForgeRepository,
  type ForgeReviewScope,
} from "./contracts/forge";

export function reviewScopeFromSource(
  source: ForgeRepository | undefined,
): ForgeReviewScope | undefined {
  return source?.account
    ? {
        version: 1,
        forge: source.forge,
        host: source.host,
        repository: source.repository,
        account: source.account,
      }
    : undefined;
}

export function sameReviewScope(
  left: ForgeReviewScope | undefined,
  right: ForgeReviewScope | undefined,
): boolean {
  return (
    left === right ||
    Boolean(
      left &&
      right &&
      left.version === right.version &&
      left.forge === right.forge &&
      left.host === right.host &&
      left.repository === right.repository &&
      left.account.forge === right.account.forge &&
      left.account.host === right.account.host &&
      left.account.login === right.account.login,
    )
  );
}
export interface ForgeRemote {
  host: string;
  path: string;
  remote: string;
}

export function normalizeForgeHost(value: string): string {
  const candidate = value.includes("://") ? value : `https://${value}`;
  if (!forgeAccountRefSchema.shape.host.safeParse(candidate).success)
    throw new Error(msg("forge.hostInvalid"));
  const url = new URL(candidate);
  return url.href.replace(/\/+$/, "");
}

export function parseForgeRemote(value: string, remote: string): ForgeRemote | null {
  try {
    const scp = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(value);
    const url = new URL(value.includes("://") ? value : scp ? `ssh://${scp[1]}/${scp[2]}` : value);
    if (!["https:", "http:", "ssh:"].includes(url.protocol)) return null;
    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/, "")
      .split("/")
      .map(decodeURIComponent);
    if (parts.some((p) => !p || p === "." || p === ".." || /[\\\0\r\n/]/.test(p))) return null;
    if (url.hostname === "ssh.dev.azure.com" && parts[0] === "v3" && parts.length === 4) {
      return {
        host: `https://dev.azure.com/${encodeURIComponent(parts[1]!)}`,
        path: `${parts[2]}/${parts[3]}`,
        remote,
      };
    }
    if (url.hostname === "dev.azure.com" && parts.length === 4 && parts[2] === "_git") {
      return {
        host: `https://dev.azure.com/${encodeURIComponent(parts[0]!)}`,
        path: `${parts[1]}/${parts[3]}`,
        remote,
      };
    }
    if (url.hostname.endsWith(".visualstudio.com") && parts.includes("_git")) {
      const index = parts.indexOf("_git");
      if (!parts[index - 1] || !parts[index + 1]) return null;
      return {
        host: `https://${url.host}`,
        path: `${parts[index - 1]}/${parts[index + 1]}`,
        remote,
      };
    }
    return parts.length >= 2
      ? {
          host: `https://${url.protocol === "ssh:" ? url.hostname : url.host}`,
          path: parts.join("/"),
          remote,
        }
      : null;
  } catch {
    return null;
  }
}
