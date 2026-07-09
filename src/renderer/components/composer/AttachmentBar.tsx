import type { ReactNode } from "react";
import { Tooltip } from "@heroui/react";
import { Monitor, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { isRemoteSession } from "@/renderer/bridge";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { toLocalFileUrl } from "@/shared/promptContent";
import type { ComposerMcpServerDescriptor } from "./composerMcpServers";
import type { Attachment } from "./useAttachments";

/**
 * Enabled-MCP indicator, parameterized by a {@link ComposerMcpServerDescriptor}
 * from the composer MCP registry so adding a new MCP needs no new chip code.
 *
 * - `chip` (default): a removable pill in the composer attachment bar.
 * - `header`: a non-interactive status icon in the active-thread header. The
 *   MCP server set is bound at session-create time, so a mid-thread change
 *   can't reconfigure the running session — the icon is informational only, but
 *   rendered as a <button> to match the sibling header status controls.
 */
/** The subset of a composer MCP descriptor the chip actually renders. */
type McpChipDescriptor = Pick<
  ComposerMcpServerDescriptor,
  "icon" | "label" | "enabledTitle" | "disableLabel"
>;

export function McpChip(props: {
  descriptor: McpChipDescriptor;
  onRemove?: (() => void) | undefined;
  title?: string;
  variant?: "chip" | "header";
}) {
  const { t } = useLingui();
  const { descriptor, onRemove, variant = "chip" } = props;
  const Icon = descriptor.icon;
  const title = props.title ?? t(descriptor.enabledTitle);
  if (variant === "header") {
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <button
            type="button"
            className="lightcode-overlay-header__controls shrink-0 rounded p-1 text-muted/60 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon className="size-3.5" aria-hidden="true" />
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
      <Icon className="size-3 text-muted" aria-hidden="true" />
      <span className="lightcode-attachment-chip__name">{t(descriptor.label)}</span>
      {onRemove ? (
        <button
          type="button"
          className="lightcode-attachment-chip__delete"
          aria-label={t(descriptor.disableLabel)}
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

/**
 * Computer Use is not a composer MCP registry entry (its gating lives in
 * `getComputerUseScope`), but its chip renders through {@link McpChip} with a
 * descriptor-shaped constant so there is a single chip implementation.
 */
const computerUseChipDescriptor: McpChipDescriptor = {
  icon: Monitor,
  label: msg`Computer Use`,
  enabledTitle: msg`Computer Use enabled — interactive actions take over the desktop; don't use the machine while the agent is controlling it`,
  disableLabel: msg`Disable Computer Use`,
};

export function ComputerUseChip(props: {
  onRemove?: (() => void) | undefined;
  title?: string;
  variant?: "chip" | "header";
}) {
  const { t } = useLingui();
  // Interactive actions steal the real mouse/keyboard on the host desktop —
  // including when driving from a paired phone.
  const title =
    props.title ??
    (isRemoteSession()
      ? t`Computer Use enabled — controls the paired desktop; don't use that machine while the agent is controlling it`
      : t`Computer Use enabled — interactive actions take over the desktop; don't use the machine while the agent is controlling it`);
  return (
    <McpChip
      descriptor={computerUseChipDescriptor}
      onRemove={props.onRemove}
      title={title}
      {...(props.variant !== undefined ? { variant: props.variant } : {})}
    />
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
