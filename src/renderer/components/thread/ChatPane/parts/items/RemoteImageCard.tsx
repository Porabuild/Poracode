import type { RemoteImageRefValue } from "@/shared/remote";
import { CARD_VARIANT_MIN_SOURCE_BYTES } from "@/shared/remote/clientEnvironmentImages";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import {
  fetchRemoteImageRefUrl,
  useRemoteImageRefSnapshot,
  useRemoteImageRefUrl,
} from "@/renderer/state/remoteServers/useRemoteImageReadiness";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";
import { useImageViewportPriority } from "@/renderer/components/common/useImageViewportPriority";

/**
 * `ImageCard` with keyed environment readiness (R3). When the source is a
 * host-held reference, the card subscribes to exactly that key through
 * readiness, failure and ordinary cache eviction — no other
 * store event is required. Direct/ssh sources pass through untouched.
 *
 * Display uses the host's downscaled "card" variant; full resolution is
 * fetched on demand for preview/copy/download. A full-resolution URL that
 * is already cached paints immediately while the variant loads.
 */
export function RemoteImageCard(props: {
  readonly source: ImageViewSource;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly isBlock?: boolean;
}) {
  const readiness = useChatPaneActions()?.remoteImageReadiness;
  const ref: RemoteImageRefValue | undefined = props.source.remoteRef;
  const { viewportRef, priority, readRank } = useImageViewportPriority(
    ref !== undefined && readiness !== undefined,
  );
  const variant = ref && ref.bytes > CARD_VARIANT_MIN_SOURCE_BYTES ? ("card" as const) : undefined;
  const variantUrl = useRemoteImageRefUrl(
    ref,
    readiness,
    props.source.src,
    priority,
    variant,
    readRank,
  );
  const fullSnapshot = useRemoteImageRefSnapshot(variant ? ref : undefined, readiness);
  const url = variantUrl || fullSnapshot || (ref ? "" : props.source.src);
  const source: ImageViewSource =
    url === props.source.src
      ? props.source
      : { ...props.source, src: url, pending: url.length === 0 };
  const resolveFullSrc =
    variant && ref && readiness ? () => fetchRemoteImageRefUrl(ref, readiness) : undefined;
  return (
    <ImageCard
      source={source}
      viewportRef={viewportRef}
      {...(resolveFullSrc ? { resolveFullSrc } : {})}
      {...(props.className !== undefined ? { className: props.className } : {})}
      {...(props.imageClassName !== undefined ? { imageClassName: props.imageClassName } : {})}
      {...(props.isBlock !== undefined ? { isBlock: props.isBlock } : {})}
    />
  );
}
