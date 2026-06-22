import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { Globe, X } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { Attachment } from "./useAttachments";

export function BrowserChip(props: {
  onRemove?: (() => void) | undefined;
  title?: string;
  variant?: "chip" | "header";
}) {
  const { t } = useLingui();
  const { onRemove, variant = "chip" } = props;
  const title = props.title ?? t`Browser MCP enabled for this thread`;
  if (variant === "header") {
    // Same structure as the other header buttons (CircleCheck / ArrowRightLeft
    // / Bug / X) so the indicator slots into the row without alignment drift.
    // Non-interactive — mid-thread browserMcp changes can't reconfigure the
    // running session — but rendering as <button> keeps it consistent with the
    // sibling status icon, which is also a no-op button.
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <button
            type="button"
            className="lightcode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="size-3.5" aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content>{title}</Tooltip.Content>
      </Tooltip>
    );
  }
  return (
    <div
      className="lightcode-attachment-chip lightcode-browser-chip"
      title={title}
      aria-label={title}
      role={onRemove ? "group" : "img"}
    >
      <Globe className="size-3 text-muted" aria-hidden="true" />
      <span className="lightcode-attachment-chip__name">{t`Browser`}</span>
      {onRemove ? (
        <button
          type="button"
          className="lightcode-attachment-chip__delete"
          aria-label={t`Disable Browser MCP`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="size-2" />
        </button>
      ) : null}
    </div>
  );
}

function AttachmentChip(props: {
  attachment: Attachment;
  onRemove?: ((id: string) => void) | undefined;
  onPreviewImage?: ((attachment: Attachment) => void) | undefined;
  hideImageName?: boolean;
}) {
  const { t } = useLingui();
  const { attachment: att, onRemove, onPreviewImage, hideImageName } = props;
  const isPicked = !!att.selector;
  const labelText = isPicked ? att.selector! : att.name;
  const showLabel = isPicked || !att.isImage || !hideImageName;
  const tooltip = isPicked
    ? att.sourceUrl
      ? `${att.selector}\n${att.sourceUrl}`
      : att.selector
    : undefined;
  const labelClass = isPicked
    ? "lightcode-attachment-chip__name lightcode-attachment-chip__selector"
    : "lightcode-attachment-chip__name";

  const content = (
    <>
      {att.isImage ? (
        <img
          className="lightcode-attachment-chip__thumb"
          src={toLocalFileUrl(att.path)}
          alt={att.name}
          decoding="async"
          draggable={false}
        />
      ) : (
        <img
          className="lightcode-attachment-chip__icon"
          src={getEntryIconUrl(att.name, false)}
          alt=""
          draggable={false}
        />
      )}
      {showLabel ? (
        <span className={labelClass} {...(tooltip ? { title: tooltip } : {})}>
          {labelText}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="lightcode-attachment-chip__delete"
          aria-label={t`Remove ${att.name}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(att.id);
          }}
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </>
  );

  if (att.isImage && onPreviewImage) {
    return (
      <div
        className="lightcode-attachment-chip"
        role="button"
        tabIndex={0}
        onClick={() => onPreviewImage(att)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPreviewImage(att);
          }
        }}
      >
        {content}
      </div>
    );
  }

  return <div className="lightcode-attachment-chip">{content}</div>;
}

function ImagePreview(props: {
  attachment: Attachment;
  onPreviewImage?: ((attachment: Attachment) => void) | undefined;
}) {
  const { t } = useLingui();
  const { attachment: att, onPreviewImage } = props;
  const img = (
    <img src={toLocalFileUrl(att.path)} alt={att.name} decoding="async" draggable={false} />
  );
  if (onPreviewImage) {
    return (
      <button
        type="button"
        className="lightcode-attachment-image-preview"
        data-lightcode-attachment-image-preview="true"
        onClick={() => onPreviewImage(att)}
        aria-label={t`Preview ${att.name}`}
      >
        {img}
      </button>
    );
  }
  return (
    <span
      className="lightcode-attachment-image-preview"
      data-lightcode-attachment-image-preview="true"
    >
      {img}
    </span>
  );
}

export function AttachmentBar(props: {
  attachments: Attachment[];
  onRemove?: ((id: string) => void) | undefined;
  onPreviewImage?: (attachment: Attachment) => void;
  layout?: "inset" | "flush";
  hideImageNames?: boolean;
  imagesAsPreview?: boolean;
  leading?: ReactNode;
}) {
  const {
    attachments,
    onRemove,
    onPreviewImage,
    layout = "inset",
    hideImageNames,
    imagesAsPreview,
    leading,
  } = props;
  if (attachments.length === 0 && !leading) return null;

  const className =
    layout === "inset"
      ? "lightcode-attachment-bar lightcode-attachment-bar--inset"
      : "lightcode-attachment-bar";

  return (
    <div className={className}>
      {leading}
      {attachments.map((att) =>
        imagesAsPreview && att.isImage && !att.selector ? (
          <ImagePreview key={att.id} attachment={att} onPreviewImage={onPreviewImage} />
        ) : (
          <AttachmentChip
            key={att.id}
            attachment={att}
            onRemove={onRemove}
            onPreviewImage={onPreviewImage}
            {...(hideImageNames === undefined ? {} : { hideImageName: hideImageNames })}
          />
        ),
      )}
    </div>
  );
}
