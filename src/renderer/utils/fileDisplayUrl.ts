import type { ProjectLocation } from "@/shared/contracts";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import { resolveLocalFileUrlPath, toLocalFileUrl } from "@/shared/promptContent";
import { resolveHostFilePath } from "./resolveHostFilePath";

/**
 * Builds a URL an `<img>` can load for a file opened in an editor.
 *
 * Local projects use the `poracode-local` protocol. The mobile PWA has a
 * resolver installed (see `shared/localImageDisplay.ts`) that maps those URLs
 * to the paired desktop's image endpoint. A desktop project that lives on a
 * remote host carries `remoteServerId`; its file loads from that host's image
 * endpoint through `remoteLocalImageUrl`.
 *
 * `version` is added to the URL so the image reloads when the file changes.
 */
export function resolveFileDisplayUrl(options: {
  projectLocation: ProjectLocation;
  path: string;
  version?: number;
  remoteLocalImageUrl?: (remoteServerId: string, absolutePath: string) => string;
}): string {
  const { projectLocation, path, version, remoteLocalImageUrl } = options;
  const localUrl = toLocalFileUrl(resolveHostFilePath(path, projectLocation));
  const remoteServerId = projectLocation.remoteServerId;
  const url =
    remoteServerId && remoteLocalImageUrl
      ? remoteLocalImageUrl(
          remoteServerId,
          resolveLocalFileUrlPath(localUrl, projectLocation.kind === "windows" ? "win32" : "linux"),
        )
      : resolveLocalImageDisplayUrl(localUrl);
  if (!url || version === undefined) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}
