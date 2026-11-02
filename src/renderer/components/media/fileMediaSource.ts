import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ProjectLocation } from "@/shared/contracts";
import type {
  EnvironmentMediaTicketResult,
  MediaFileRequest,
  MediaSource,
} from "@/shared/remote/media";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { getBasename, isAbsoluteFsPath } from "@/shared/pathUtils";
import { readBridge } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { getManagedParentAuthorityState } from "@/renderer/state/remoteServers/managedLoopbackOwner";
import { getRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { ownMediaImageReads } from "./ownedMediaImageReads";

export interface EditorMediaSource extends MediaSource {
  renew(signal: AbortSignal): Promise<EnvironmentMediaTicketResult>;
  release(): Promise<void>;
  readImageBytes(): Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * The single owning media transport for a location: a paired remote server
 * when `remoteServerId` is set, otherwise the local bridge or managed parent
 * authority. Never a native fallback — a remote file must not be read from
 * the wrong host.
 */
async function withOwningMediaClient<T>(
  location: ProjectLocation,
  run: (client: RemoteDesktopClient) => Promise<T>,
): Promise<T> {
  if (location.remoteServerId)
    return useRemoteServersStore.getState().withClient(location.remoteServerId, run);
  const managed = getManagedParentAuthorityState();
  const client =
    getRemoteBridgeClient() ?? (managed.status === "ready" ? managed.authority.client : null);
  if (!client) throw new Error(i18n._(msg`Remote server not found.`));
  return run(client);
}

export async function createEditorMediaSource(
  location: ProjectLocation,
  path: string,
  signal: AbortSignal,
): Promise<EditorMediaSource> {
  const { remoteServerId: _remoteServerId, ...projectLocation } = location;
  const file = {
    access: isAbsoluteFsPath(path) ? ("external" as const) : ("project" as const),
    projectLocation,
    path,
  };
  const create = async (client: RemoteDesktopClient): Promise<EditorMediaSource> => {
    const source = await client.createMediaSource(file, signal);
    return {
      ...source,
      renew: (renewSignal) => client.renewMediaSource(source.ticket, renewSignal),
      ...ownMediaImageReads(
        (readSignal) => client.fetchMediaImageBytes(source, readSignal),
        () => client.releaseMediaSource(source.ticket),
      ),
    };
  };
  return withOwningMediaClient(location, create);
}

/**
 * Separators and redundant `.` segments only — `..` is never collapsed
 * lexically because it must not reinterpret the path across symlinks. A
 * leading UNC `//host/share` prefix is preserved so it can never collapse
 * into (or be claimed by) a POSIX `/` root.
 */
function normalizeSeparators(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const unc = normalized.startsWith("//");
  const segments = (unc ? normalized.slice(2) : normalized)
    .split("/")
    .filter((segment, index) => segment !== "." && (segment !== "" || index === 0))
    .join("/");
  return unc ? `//${segments}` : segments;
}

/**
 * The project-relative form of an absolute path under the owning root, or
 * null when it is genuinely outside. POSIX and WSL paths (including the
 * distro content under the UNC alias) compare case-sensitively; native
 * Windows roots compare case-insensitively, preserving UNC identity.
 */
function containedRelativePath(location: ProjectLocation, absolute: string): string | null {
  const normalized = normalizeSeparators(absolute);
  const roots: { root: string; insensitive: boolean }[] =
    location.kind === "wsl"
      ? [
          { root: location.linuxPath, insensitive: false },
          { root: location.uncPath, insensitive: false },
        ]
      : [{ root: location.path, insensitive: location.kind === "windows" }];
  for (const { root: rawRoot, insensitive } of roots) {
    const root = normalizeSeparators(rawRoot).replace(/\/+$/u, "") || "/";
    const haystack = insensitive ? normalized.toLowerCase() : normalized;
    const needle = insensitive ? root.toLowerCase() : root;
    if (haystack === needle) return null; // the root itself is not a file path
    if (needle === "/") {
      // A POSIX root contains absolute POSIX descendants only — never UNC.
      if (normalized.startsWith("/") && !normalized.startsWith("//") && normalized.length > 1)
        return normalized.slice(1);
      continue;
    }
    if (haystack.startsWith(`${needle}/`)) return normalized.slice(root.length + 1);
  }
  return null;
}

/**
 * The media request for an explicit file download. Paths under the owning
 * root mint a contained project request; genuinely outside absolute paths
 * stay external (still scope-gated host-side). A relative `..` traversal is
 * refused outright and can never escalate to an authorized external read.
 */
export function chatFileMediaRequest(location: ProjectLocation, path: string): MediaFileRequest {
  const { remoteServerId: _remoteServerId, ...projectLocation } = location;
  // A `..` segment — absolute or relative — is refused outright: never
  // collapse it lexically (symlinks change real meaning) and never promote
  // it to an external read.
  if (path.split(/[\\/]/u).includes(".."))
    throw new Error(i18n._(msg`The file path is outside the project.`));
  if (isAbsoluteFsPath(path)) {
    const relative = containedRelativePath(location, path);
    if (relative !== null) return { access: "project", projectLocation, path: relative };
    return { access: "external", projectLocation, path };
  }
  const relative = normalizeSeparators(path).replace(/^\/+/u, "");
  if (!relative) throw new Error(i18n._(msg`The file path is outside the project.`));
  return { access: "project", projectLocation, path: relative };
}

/**
 * Mint an attachment grant for `path` on its owning host and hand the ticket
 * URL to the platform's normal download machinery — bytes stream to disk,
 * never through a JS blob. In the native shell the sanctioned
 * `readBridge().openExternal` route carries the URL into the existing
 * browser/download flow (in-app navigation guards would block a top-level
 * renderer anchor); on the web a temporary `download` anchor does the same.
 * A successful handoff proves the OS/browser accepted the URL, not that the
 * on-disk write finished — the minted grant covers the bounded ticket TTL
 * for that stream. An aborted or failed start releases the grant.
 */
export async function downloadChatFile(
  location: ProjectLocation,
  path: string,
  signal: AbortSignal,
): Promise<void> {
  const file: MediaFileRequest = {
    ...chatFileMediaRequest(location, path),
    disposition: "attachment",
  };
  const name = getBasename(path.replaceAll("\\", "/"));
  await withOwningMediaClient(location, async (client) => {
    const source = await client.createMediaSource(file, signal);
    const release = () => client.releaseMediaSource(source.ticket).catch(() => undefined);
    if (signal.aborted) {
      await release();
      return;
    }
    try {
      if (hasClientCapability("nativeShell")) {
        await readBridge().openExternal(source.url);
      } else {
        const anchor = document.createElement("a");
        anchor.href = source.url;
        anchor.download = name;
        anchor.rel = "noreferrer noopener";
        anchor.click();
      }
    } catch (error) {
      await release();
      throw error;
    }
    // Intentionally no release: the launched download streams under the
    // minted grant, which retires on its own bounded TTL (or session end).
  });
}
