/* oxlint-disable jsx-a11y/media-has-caption -- Agent-provided video files have no caption track in the resource contract. */
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import { resolveMarkdownImageUrl } from "@/shared/markdownLocalImages";
import { chatVideoFilePath, isChatVideoSource, type ChatVideoSource } from "@/shared/chatVideo";
import { getProjectFsPath } from "@/shared/wsl";
import { useFileMediaSource } from "@/renderer/components/media/useFileMediaSource";
import { useChatPaneActions } from "../../chatPaneActionsContext";

export function MarkdownVideo(props: ChatVideoSource) {
  return <VideoDocument key={props.src} {...props} />;
}

function VideoDocument({ src, name, mimeType }: ChatVideoSource) {
  const { t } = useLingui();
  const actions = useChatPaneActions();
  const location = actions?.mediaLocation ?? actions?.projectLocation ?? null;
  const webUrl = /^https?:\/\//iu.test(src);
  const canonical = webUrl
    ? src
    : (resolveMarkdownImageUrl(src, {
        ...(location ? { projectRoot: getProjectFsPath(location) } : {}),
        ...(actions?.markdownImageRoots ? { extraRoots: actions.markdownImageRoots } : {}),
      }) ?? src);
  const path = webUrl ? "" : (chatVideoFilePath(canonical) ?? "");
  const valid = isChatVideoSource(src, mimeType);
  const [reload, setReload] = useState(0);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { source, failed } = useFileMediaSource(
    valid && !webUrl && path ? location : null,
    path,
    0,
    reload,
  );
  const url = valid ? (webUrl ? src : source?.url) : undefined;
  const unavailable = !valid || (webUrl ? failedUrl === url : failed || failedUrl === url);
  return (
    <span
      className="not-prose my-2 inline-flex w-full max-w-xl flex-col gap-1 overflow-hidden rounded-lg border border-border bg-surface-secondary align-top"
      data-testid="chat-video"
    >
      {url && !unavailable ? (
        <video
          ref={ownVideoPlayer}
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={name || t`Video preview`}
          className="max-h-[28rem] w-full bg-black object-contain"
          onLoadedMetadata={() => actions?.onContentHeightChange?.()}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span role="status" className="p-4 text-sm text-muted">
          {unavailable ? (
            <Trans>This media preview is unavailable.</Trans>
          ) : (
            <Trans>Loading media preview…</Trans>
          )}
        </span>
      )}
      {name ? <span className="truncate px-3 pb-2 text-xs text-muted">{name}</span> : null}
      {unavailable && valid ? (
        <Button
          variant="ghost"
          size="sm"
          className="m-1 self-start"
          onPress={() => {
            setFailedUrl(null);
            setReload((value) => value + 1);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      ) : null}
    </span>
  );
}

function ownVideoPlayer(player: HTMLVideoElement | null) {
  if (!player) return;
  return () => {
    player.pause();
    player.removeAttribute("src");
    player.load();
  };
}
