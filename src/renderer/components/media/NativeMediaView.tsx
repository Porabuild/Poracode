/* oxlint-disable jsx-a11y/media-has-caption -- User-selected files have no caption source in the file contract. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { MediaDetails } from "./MediaDetails";

/** Source renewal preserves the reader's position and play/pause intent. No autoplay on open. */
export function NativeMediaView(props: {
  kind: "audio" | "video";
  src: string;
  sizeBytes: number;
  fallback: ReactNode;
}) {
  const { t } = useLingui();
  const element = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const position = useRef({ time: 0, paused: true });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ duration?: number; width?: number; height?: number }>(
    {},
  );
  useEffect(() => {
    const player = element.current;
    if (!player) return;
    position.current = { time: player.currentTime, paused: player.paused };
    player.src = props.src;
    player.load();
  }, [props.src]);
  useEffect(() => {
    if (failedSrc === props.src) return;
    const player = element.current;
    return () => {
      if (player && player !== element.current) player.pause();
    };
  }, [props.src, failedSrc]);
  const attributes = {
    ref: (player: HTMLVideoElement | HTMLAudioElement | null) => {
      element.current = player;
    },
    controls: true,
    preload: "metadata",
    "aria-label": props.kind === "video" ? t`Video preview` : t`Audio preview`,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const player = event.currentTarget;
      setMetadata({
        duration: player.duration,
        ...(player instanceof HTMLVideoElement
          ? { width: player.videoWidth, height: player.videoHeight }
          : {}),
      });
      if (position.current.time > 0)
        player.currentTime = Math.min(
          position.current.time,
          Number.isFinite(player.duration) ? player.duration : position.current.time,
        );
      if (!position.current.paused) void player.play().catch(() => undefined);
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
