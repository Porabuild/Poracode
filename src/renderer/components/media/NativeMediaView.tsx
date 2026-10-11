/* oxlint-disable jsx-a11y/media-has-caption -- User-selected files have no caption source in the file contract. */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLingui } from "@lingui/react/macro";
import { MediaDetails } from "./MediaDetails";

export interface MediaPlaybackPosition {
  time: number;
  paused: boolean;
}

/** Stable-URL renewals leave native playback untouched; file reloads preserve position/play intent. No autoplay on open. */
export function NativeMediaView(props: {
  kind: "audio" | "video";
  src: string;
  sizeBytes: number;
  fallback: ReactNode;
  /** A document-owned numeric snapshot survives a grant-loading gap without retaining a retired player or URL. */
  playbackPositionRef?: RefObject<MediaPlaybackPosition>;
}) {
  const { t } = useLingui();
  const element = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const positionRef = useRef<MediaPlaybackPosition>({ time: 0, paused: true });
  const hasMetadata = useRef(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ duration?: number; width?: number; height?: number }>(
    {},
  );
  useEffect(() => {
    const player = element.current;
    if (!player) return;
    if (hasMetadata.current)
      positionRef.current = { time: player.currentTime, paused: player.paused };
    else if (props.playbackPositionRef) positionRef.current = props.playbackPositionRef.current;
    hasMetadata.current = false;
    player.src = props.src;
    player.load();
  }, [props.src, props.playbackPositionRef]);
  useEffect(() => {
    if (failedSrc === props.src) return;
    const player = element.current;
    const documentPositionRef = props.playbackPositionRef;
    return () => {
      if (player && player !== element.current) {
        if (hasMetadata.current)
          positionRef.current = { time: player.currentTime, paused: player.paused };
        if (documentPositionRef) documentPositionRef.current = positionRef.current;
        player.pause();
        hasMetadata.current = false;
      }
    };
  }, [props.src, failedSrc, props.playbackPositionRef]);
  const attributes = {
    ref: (player: HTMLVideoElement | HTMLAudioElement | null) => {
      element.current = player;
    },
    controls: true,
    preload: "metadata",
    "aria-label": props.kind === "video" ? t`Video preview` : t`Audio preview`,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const player = event.currentTarget;
      hasMetadata.current = true;
      setMetadata({
        duration: player.duration,
        ...(player instanceof HTMLVideoElement
          ? { width: player.videoWidth, height: player.videoHeight }
          : {}),
      });
      if (positionRef.current.time > 0)
        player.currentTime = Math.min(
          positionRef.current.time,
          Number.isFinite(player.duration) ? player.duration : positionRef.current.time,
        );
      if (!positionRef.current.paused) void player.play().catch(() => undefined);
    },
    onError: () => setFailedSrc(props.src),
  };
  if (failedSrc === props.src) return props.fallback;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="native-media-view">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {props.kind === "video" ? (
          <video {...attributes} playsInline className="max-h-full max-w-full" />
        ) : (
          <audio {...attributes} className="w-full max-w-lg" />
        )}
      </div>
      <MediaDetails sizeBytes={props.sizeBytes} {...metadata} />
    </div>
  );
}
