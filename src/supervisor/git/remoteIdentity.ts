import type { GitRemoteInfo, ProjectLocation } from "@/shared/contracts";
import { parseForgeRemote } from "@/shared/forgeRemote";
import type { ForgeRuntime } from "../forges/runtime";
import { parseRemoteUrl } from "./exec";

/** Resolve SSH aliases on the owning host without changing Git's configured remote. */
export async function resolveGitRemoteInfo(
  location: ProjectLocation,
  info: GitRemoteInfo | null,
  runtime: Pick<ForgeRuntime, "run" | "environment">,
): Promise<GitRemoteInfo | null> {
  if (!info || (info.url.includes("://") && !info.url.startsWith("ssh://"))) return info;
  if (!parseForgeRemote(info.url, "origin")) return info;
  try {
    const env = await runtime.environment(location);
    if (env.GIT_SSH || env.GIT_SSH_COMMAND || env.GIT_SSH_VARIANT) return info;
    const overrides = await runtime.run(
      location,
      "git",
      ["config", "--get-regexp", "^(core\\.sshcommand|ssh\\.variant)$"],
      undefined,
      true,
    );
    if (overrides.trim()) return info;
    const url = new URL(
      info.url.includes("://") ? info.url : info.url.replace(/^((?:[^@/]+@)?[^/:]+):/, "ssh://$1/"),
    );
    const username = decodeURIComponent(url.username);
    // SSH config's Match exec expands these tokens without shell escaping.
    if (!/^[a-z0-9._-]*$/i.test(username) || !/^[a-z0-9._-]+$/i.test(url.hostname)) return info;
    const output = await runtime.run(location, "ssh", [
      "-G",
      ...(username ? ["-l", username] : []),
      ...(url.port ? ["-p", url.port] : []),
      "--",
      url.hostname,
    ]);
    // A port or proxy can route identical hostnames to different repositories.
    const port = /^port\s+(\S+)\s*$/im.exec(output)?.[1];
    if (port && port !== "22") return info;
    if (/^proxy(?:command|jump)\s+(?!none\s*$)\S/im.test(output)) return info;
    const hostname = /^hostname\s+(\S+)\s*$/im.exec(output)?.[1];
    if (!hostname || hostname.toLowerCase() === url.hostname.toLowerCase()) return info;
    url.hostname = hostname;
    if (url.hostname.toLowerCase() !== hostname.toLowerCase()) return info;
    return parseRemoteUrl(url.toString()) ?? info;
  } catch {
    // Missing SSH or an unreadable config must not prevent Git status refreshes.
    return info;
  }
}
