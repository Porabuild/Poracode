import { X } from "lucide-react";
import { getEntryIconUrl } from "../common/fileIcons";
import { toLocalFileUrl, type Attachment } from "./useAttachments";

function AttachmentChip(props: {
  attachment: Attachment;
  onRemove: (id: string) => void;
  onPreviewImage?: ((attachment: Attachment) => void) | undefined;
}) {
  const { attachment: att, onRemove, onPreviewImage } = props;

  const content = (
    <>
      {att.isImage ? (
        <img
          className="lightcode-attachment-chip__thumb"
          src={toLocalFileUrl(att.path)}
          alt={att.name}
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
      <span className="lightcode-attachment-chip__name">{att.name}</span>
      <button
        type="button"
        className="lightcode-attachment-chip__delete"
        aria-label={`Remove ${att.name}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(att.id);
        }}
      >
        <X className="size-2.5" />
      </button>
    </>
  );

  if (att.isImage && onPreviewImage) {
    return (
      <button
        type="button"
        className="lightcode-attachment-chip"
        onClick={() => onPreviewImage(att)}
      >
        {content}
      </button>
    );
  }

  return <div className="lightcode-attachment-chip">{content}</div>;
}

export function AttachmentBar(props: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  onPreviewImage?: (attachment: Attachment) => void;
}) {
  const { attachments, onRemove, onPreviewImage } = props;
  if (attachments.length === 0) return null;

  return (
    <div className="lightcode-attachment-bar">
      {attachments.map((att) => (
        <AttachmentChip
          key={att.id}
          attachment={att}
          onRemove={onRemove}
          onPreviewImage={onPreviewImage}
        />
      ))}
    </div>
  );
}
