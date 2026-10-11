import type { ProjectLocation } from "@/shared/contracts";
import { resolveLocalFileUrlPath } from "@/shared/promptContent";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import type { ChatPaneActions } from "./chatPaneActionsContext";

interface MarkdownLocalImageAuthorityOptions {
  projectLocation?: ProjectLocation | undefined;
  remote?:
    | {
        available: boolean;
        resolvePath: (path: string) => string;
        /** Existing paired-host decoder for browser panes without a projected owner. */
        pathForUrl?: ((url: string) => string) | undefined;
        readiness?: RemoteImageReadiness | undefined;
      }
    | undefined;
  isManagedThread: boolean;
}

/**
 * Select Markdown path custody independently of project file actions. Remote
 * owners supply live readiness; managed own-host paths deliberately keep the
 * native local-file protocol, rather than their inline-reference blob cache.
 */
export function createMarkdownLocalImageAuthority({
  projectLocation,
  remote,
  isManagedThread,
}: MarkdownLocalImageAuthorityOptions): Pick<
  ChatPaneActions,
  "remoteLocalImageUrl" | "markdownLocalImageReadiness"
> {
  if (remote) {
    const platform = projectLocation?.kind === "windows" ? "win32" : "linux";
    const pathForUrl = (url: string): string | undefined => {
      try {
        return remote.pathForUrl ? remote.pathForUrl(url) : resolveLocalFileUrlPath(url, platform);
      } catch {
        return undefined;
      }
    };
    return {
      remoteLocalImageUrl: (url) => {
        if (!remote.available) return "";
        const path = pathForUrl(url);
        return path ? remote.resolvePath(path) : "";
      },
      ...(remote.available && remote.readiness
        ? { markdownLocalImageReadiness: { readiness: remote.readiness, pathForUrl } }
        : {}),
    };
  }
  return isManagedThread ? { remoteLocalImageUrl: (url) => url } : {};
}
