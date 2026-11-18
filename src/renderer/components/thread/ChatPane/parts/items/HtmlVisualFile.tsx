import { useEffect, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { ProjectLocation } from "@/shared/contracts";
import { chatFileLocalPath, isChatFileSource } from "@/shared/chatFile";
import { htmlVisualSourceFits } from "@/shared/htmlVisuals";
import { INLINE_VISUAL_FORMAT_VERSION } from "@/shared/inlineVisuals";
import { getBasename, isAbsoluteFsPath, normalizeWindowsDrivePath } from "@/shared/pathUtils";
import { readBridge } from "@/renderer/bridge";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { HtmlVisual } from "./HtmlVisual";
import { InlineFilePathChip } from "./InlineFilePathChip";
import { useMcpAppSandboxEndpoint } from "./mcpAppSandboxEndpoint";

export function HtmlVisualFile({
  path,
  title,
  limited,
}: {
  path: string;
  title: string;
  limited: boolean;
}) {
  const actions = useChatPaneActions();
  const endpoint = useMcpAppSandboxEndpoint();
  const location = actions?.mediaLocation;
  const localPath = chatFileLocalPath(path);
  const label = title || getBasename(localPath ?? path);
  const relativePath = location && localPath ? projectHtmlPath(localPath, location) : undefined;
  const fallback = (
    <InlineFilePathChip
      path={localPath ?? path}
      name={label}
      onOpen={actions?.openProjectRelativePath}
    />
  );
  if (limited || !endpoint || !location || !relativePath) return fallback;
  return (
    <WorkspaceHtmlVisual
      key={JSON.stringify([endpoint, location, relativePath])}
      location={location}
      path={relativePath}
      title={label}
      fallback={fallback}
    />
  );
}

function projectHtmlPath(path: string, location: ProjectLocation): string | undefined {
  // The file procedure is scoped to the owning worktree, including symlink
  // checks on the host. External references stay ordinary file chips.
  const usesWindowsPath =
    location.kind === "windows" || (location.kind === "wsl" && /^(\\\\|\/\/)/u.test(path));
  const root =
    location.kind === "wsl"
      ? usesWindowsPath
        ? location.uncPath
        : location.linuxPath
      : location.path;
  const normalize = (value: string) =>
    usesWindowsPath ? normalizeWindowsDrivePath(value).replace(/\\/gu, "/") : value;
  const normalized = normalize(path);
  const rootPrefix = normalize(root).replace(/\/+$/u, "") + "/";
  const insideRoot = usesWindowsPath
    ? normalized.toLowerCase().startsWith(rootPrefix.toLowerCase())
    : normalized.startsWith(rootPrefix);
  const relative = insideRoot ? normalized.slice(rootPrefix.length) : normalized;
  if (
    !/\.html?$/iu.test(relative) ||
    !isChatFileSource(relative) ||
    isAbsoluteFsPath(relative) ||
    relative.includes("\\") ||
    relative.split("/").includes("..")
  ) {
    return undefined;
  }
  return relative;
}

function WorkspaceHtmlVisual({
  location,
  path,
  title,
  fallback,
}: {
  location: ProjectLocation;
  path: string;
  title: string;
  fallback: ReactNode;
}) {
  const { t } = useLingui();
  const [html, setHtml] = useState<string | null>();
  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const result = await readBridge().readProjectFile({ projectLocation: location, path });
        if (current) {
          const source = result.status === "ready" ? result.content : undefined;
          setHtml(source && htmlVisualSourceFits(source) ? source : null);
        }
      } catch {
        if (current) setHtml(null);
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [location, path]);

  if (html === undefined) {
    return <p role="status" className="my-2 text-xs text-muted">{t`Loading preview…`}</p>;
  }
  if (html === null) return fallback;
  return (
    <HtmlVisual
      html={html}
      title={title}
      version={INLINE_VISUAL_FORMAT_VERSION}
      complete
      isStreaming={false}
      limited={false}
    />
  );
}
