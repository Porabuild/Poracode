import { useMemo } from "react";
import type { ProjectLocation } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import { isRemoteSession } from "@/renderer/bridge";
import { hostRunsOnThisMachine } from "@/renderer/state/hostLocality";
import { managedRootOwner } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import { resolveRemoteBridgeLocalImagePath } from "@/renderer/browser/remoteBridge";
import { useThreadImageAuthority, type ThreadImageSubject } from "../threadImageAuthority";
import type { ChatPaneActions } from "./chatPaneActionsContext";
import { createMarkdownLocalImageAuthority } from "./markdownLocalImageAuthority";

/** Image-only pane actions shared by the main transcript and delegated transcripts. */
export type ThreadTranscriptImageActions = Pick<
  ChatPaneActions,
  | "markdownImageRoot"
  | "remoteImageRefUrl"
  | "remoteImageReadiness"
  | "remoteLocalImageUrl"
  | "markdownLocalImageReadiness"
>;

/**
 * Resolve the image custody of one thread's transcript without exposing the
 * parent thread's action thread id to an embedded transcript. The owning
 * connection is selected by `useThreadImageAuthority`; Markdown path decoding
 * uses the same bridge / paired / own-host branch as the main ChatPane.
 *
 * Delegated panes receive only the image-specific Markdown root. They never
 * inherit `mediaLocation`, so file chips/downloads, video and HTML previews
 * stay disabled outside the main transcript.
 */
export function useThreadTranscriptImageActions(
  thread: ThreadImageSubject | undefined,
  projectLocation: ProjectLocation | undefined,
): ThreadTranscriptImageActions {
  const imageAuthority = useThreadImageAuthority(thread);
  const isManagedThread = thread !== undefined && managedRootOwner(thread) !== undefined;
  const isRemoteThread = !hostRunsOnThisMachine(thread);
  const remoteSession = isRemoteSession();
  const threadId = thread?.id;
  const markdownImageRoot = projectLocation ? getProjectFsPath(projectLocation) : undefined;

  return useMemo(() => {
    // A missing owner fails closed on every client: never fall through to a
    // local root or another host's image resolver.
    if (!threadId) return {};
    const readiness = imageAuthority.readiness;
    return {
      ...(markdownImageRoot ? { markdownImageRoot } : {}),
      remoteImageRefUrl: imageAuthority.refUrl,
      ...(readiness ? { remoteImageReadiness: readiness } : {}),
      ...createMarkdownLocalImageAuthority({
        projectLocation,
        isManagedThread,
        ...(remoteSession || isRemoteThread
          ? {
              remote: {
                available: imageAuthority.available,
                readiness,
                ...(!isRemoteThread && remoteSession
                  ? { pathForUrl: resolveRemoteBridgeLocalImagePath }
                  : {}),
                resolvePath: imageAuthority.localImageUrl,
              },
            }
          : {}),
      }),
    };
  }, [
    imageAuthority,
    isManagedThread,
    isRemoteThread,
    markdownImageRoot,
    projectLocation,
    remoteSession,
    threadId,
  ]);
}
