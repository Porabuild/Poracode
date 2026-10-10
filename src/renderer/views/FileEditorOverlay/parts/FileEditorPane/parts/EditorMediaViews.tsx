import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { fileMediaType } from "@/shared/fileMedia";
import { getBasename } from "@/shared/pathUtils";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useFileMediaSource } from "@/renderer/components/media/useFileMediaSource";
import { ImageFileView } from "@/renderer/components/media/ImageFileView";
import {
  NativeMediaView,
  type MediaPlaybackPosition,
} from "@/renderer/components/media/NativeMediaView";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { MobilePageBottomAction } from "@/renderer/components/layout/MobilePageBottomActions";
import { MobileCircleButton } from "@/renderer/components/mobileComposer/MobileCircleButton";

interface EditorMediaViewsProps {
  path: string;
  projectLocation: ProjectLocation | null;
}

export function EditorMediaViews(props: EditorMediaViewsProps) {
  // File/location changes get a fresh owner; grant renewals and explicit reloads do not.
  return (
    <EditorMediaDocument key={JSON.stringify([props.projectLocation, props.path])} {...props} />
  );
}

function EditorMediaDocument(props: EditorMediaViewsProps) {
  const { t } = useLingui();
  const compact = useCompactLayout();
  const version = useFileEditorStore((state) => state.buffers[props.path]?.modifiedAtMs ?? 0);
  const [reload, setReload] = useState(0);
  const playbackPosition = useRef<MediaPlaybackPosition>({ time: 0, paused: true });
  const { source, failed } = useFileMediaSource(props.projectLocation, props.path, version, reload);
  const media = fileMediaType(props.path);
  const fallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      <Trans>This media preview is unavailable.</Trans>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {compact ? (
        <MobilePageBottomAction side="right">
          <MobileCircleButton
            aria-label={t`Reload preview`}
            className="text-muted"
            onPress={() => setReload((value) => value + 1)}
          >
            <RefreshCw className="size-4" />
          </MobileCircleButton>
        </MobilePageBottomAction>
      ) : (
        <div className="flex shrink-0 justify-end border-b border-[color:var(--border)] px-2 py-1">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Reload preview`}
            onPress={() => setReload((value) => value + 1)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {source && media ? (
          media.kind === "image" ? (
            <ImageFileView
              src={source.url}
              fileName={getBasename(props.path)}
              sizeBytes={source.sizeBytes}
              readBytes={source.readImageBytes}
              fallback={fallback}
            />
          ) : (
            <NativeMediaView
              kind={media.kind}
              src={source.url}
              sizeBytes={source.sizeBytes}
              fallback={fallback}
              playbackPositionRef={playbackPosition}
            />
          )
        ) : failed ? (
          fallback
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            <Trans>Loading media preview…</Trans>
          </div>
        )}
      </div>
    </div>
  );
}
