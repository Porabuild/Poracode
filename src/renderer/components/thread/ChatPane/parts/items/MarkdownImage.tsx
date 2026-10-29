import type { ComponentProps } from "react";
import type { ExtraProps } from "streamdown";
import { resolveLocalImageDisplayUrl } from "@/shared/localImageDisplay";
import {
  fetchRemoteImagePathUrl,
  useRemoteImagePathSnapshot,
  useRemoteImagePathUrl,
} from "@/renderer/state/remoteServers/useRemoteImageReadiness";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { ImageCard } from "./ImageCard";
import { imageViewSourceFromMarkdownImage } from "./imageViewSource";
import { useImageViewportPriority } from "@/renderer/components/common/useImageViewportPriority";

// Streamdown accepts both the typed img slot and its custom-tag index signature.
type MarkdownImageProps = (ComponentProps<"img"> | Record<string, unknown>) & ExtraProps;

/**
 * Resolve sanitized, canonical sources at the live image consumer. Markdown
 * processors and completed Streamdown blocks keep no owner-bound display URL;
 * a pane authority or keyed-readiness change can update this leaf in place.
 */
export function MarkdownImage({ alt, className, src, width, height }: MarkdownImageProps) {
  const actions = useChatPaneActions();
  const canonicalSrc = typeof src === "string" ? src : "";
  const isLocal = canonicalSrc.startsWith("poracode-local://");
  const authority = isLocal ? actions?.markdownLocalImageReadiness : undefined;
  const path = authority?.pathForUrl(canonicalSrc);
  const fallback = isLocal
    ? authority
      ? ""
      : actions?.remoteLocalImageUrl
        ? actions.remoteLocalImageUrl(canonicalSrc)
        : resolveLocalImageDisplayUrl(canonicalSrc)
    : canonicalSrc;
  const { viewportRef, priority } = useImageViewportPriority(
    path !== undefined && authority?.readiness !== undefined,
  );
  const readiness = authority?.readiness;
  const variantSrc = useRemoteImagePathUrl(path, readiness, fallback, priority, "card");
  const fullSnapshot = useRemoteImagePathSnapshot(path, readiness);
  const displaySrc = variantSrc || fullSnapshot || (authority ? "" : fallback);
  const resolveFullSrc =
    path && readiness ? () => fetchRemoteImagePathUrl(path, readiness) : undefined;
  if (!canonicalSrc) return null;
  return (
    <ImageCard
      viewportRef={viewportRef}
      {...(resolveFullSrc ? { resolveFullSrc } : {})}
      source={imageViewSourceFromMarkdownImage({
        src: displaySrc,
        alt: typeof alt === "string" ? alt : "",
        width,
        height,
      })}
      className="not-prose my-2"
      isBlock
      {...(typeof className === "string" && className ? { imageClassName: className } : {})}
    />
  );
}
