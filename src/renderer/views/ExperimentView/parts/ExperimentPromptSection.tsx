import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PromptSegment } from "@/shared/contracts";
import { fileNameFromPath, isImagePath } from "@/shared/promptContent";
import { AttachmentBar } from "@/renderer/components/composer/AttachmentBar";
import { openAttachmentLightbox } from "@/renderer/components/composer/ImageLightbox";
import type { Attachment } from "@/renderer/components/composer/useAttachments";

export function ExperimentPromptSection(props: {
  prompt: string;
  segments?: PromptSegment[];
  baseBranch: string;
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const attachments = experimentPromptAttachments(props.segments);
  const isCollapsible = props.prompt.length > 320 || props.prompt.split("\n").length > 4;
  const imageAttachments = attachments.filter((attachment) => attachment.isImage);

  return (
    <div className="flex flex-col gap-2 px-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
        <Trans>Prompt</Trans>
      </div>
      {attachments.length > 0 ? (
        <AttachmentBar
          attachments={attachments}
          layout="flush"
          imagesAsPreview
          onPreviewImage={(attachment) => {
            const index = imageAttachments.findIndex((item) => item.id === attachment.id);
            if (index >= 0) openAttachmentLightbox(imageAttachments, index);
          }}
        />
      ) : null}
      <p
        className={`whitespace-pre-wrap break-words text-sm text-foreground/90 ${
          isCollapsible && !expanded
            ? "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]"
            : ""
        }`}
      >
        {props.prompt}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Trans>
          Forked from <span className="font-mono">{props.baseBranch}</span>
        </Trans>
        {isCollapsible ? (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t`Show less` : t`Show more`}
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function experimentPromptAttachments(segments: PromptSegment[] | undefined): Attachment[] {
  return (segments ?? []).flatMap((segment, index) => {
    if (segment.kind !== "attachment") return [];
    const name = fileNameFromPath(segment.path);
    return [
      {
        id: `experiment-attachment-${index}-${segment.path}`,
        path: segment.path,
        name,
        ...(segment.mimeType ? { mimeType: segment.mimeType } : {}),
        isImage: isImagePath(segment.path, segment.mimeType),
      },
    ];
  });
}
