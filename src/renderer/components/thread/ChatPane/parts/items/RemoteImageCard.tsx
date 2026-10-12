import type { RemoteImageRefValue } from "@/shared/remote";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { useRemoteImageRefUrl } from "@/renderer/state/remoteServers/useRemoteImageReadiness";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";

/**
 * `ImageCard` with keyed environment readiness (R3). When the source is a
 * host-held reference, the card subscribes to exactly that key through
 * readiness, failure and ordinary cache eviction — no other
 * store event is required. Direct/ssh sources pass through untouched.
 */
export function RemoteImageCard(props: {
  readonly source: ImageViewSource;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly isBlock?: boolean;
}) {
  const readiness = useChatPaneActions()?.remoteImageReadiness;
  const ref: RemoteImageRefValue | undefined = props.source.remoteRef;
  const url = useRemoteImageRefUrl(ref, readiness, props.source.src);
  const source: ImageViewSource =
    url === props.source.src
      ? props.source
      : { ...props.source, src: url, pending: url.length === 0 };
  return (
    <ImageCard
      source={source}
      {...(props.className !== undefined ? { className: props.className } : {})}
      {...(props.imageClassName !== undefined ? { imageClassName: props.imageClassName } : {})}
      {...(props.isBlock !== undefined ? { isBlock: props.isBlock } : {})}
    />
  );
}
