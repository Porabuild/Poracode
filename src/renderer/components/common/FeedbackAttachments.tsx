import { useEffect, useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "./Button";

function Attachment({ file }: { file: File }) {
  const previewRoot = useRef<HTMLDetailsElement>(null);
  const image = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    previewRoot.current
      ?.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")
      .forEach((element) => {
        element.src = preview;
      });
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return (
    <details ref={previewRoot} className="min-w-0 flex-1">
      <summary className="flex cursor-default items-center gap-2.5">
        <span className="grid h-8 w-10 shrink-0 place-items-center overflow-hidden rounded bg-surface-secondary">
          {image ? (
            <img alt="" className="size-full object-cover" />
          ) : (
            <Paperclip className="size-3.5 text-muted" />
          )}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-xs font-medium text-foreground">
            {file.name}
          </strong>
          <small className="text-[10px] text-muted">{Math.ceil(file.size / 1024)} KB</small>
        </span>
      </summary>
      {image ? (
        <img alt={file.name} className="mt-2 max-h-64 max-w-full rounded object-contain" />
      ) : (
        <video controls muted className="mt-2 max-h-64 max-w-full rounded" />
      )}
    </details>
  );
}

export function FeedbackAttachments({
  files,
  locked,
  onAdd,
  onRemove,
}: {
  files: File[];
  locked: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useLingui();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>
          <Trans>Attachments</Trans>{" "}
          <span className="ml-1 text-[11px] text-muted">
            <Trans>(optional)</Trans>
          </span>
        </span>
        <span className="text-[11px] text-muted">
          <Trans>5 files · 10 MB each</Trans>
        </span>
      </div>
      {files.map((file, index) => (
        <div
          key={`${file.name}:${file.lastModified}:${file.size}:${index}`}
          className="flex items-start gap-2 rounded-[8px] bg-surface-secondary px-2.5 py-2 dark:bg-[#1a1a21]"
        >
          <Attachment file={file} />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            isDisabled={locked}
            aria-label={t`Remove ${file.name}`}
            onPress={() => onRemove(index)}
            className="size-6 min-w-0 text-muted"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onAdd(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const pasted = Array.from(event.clipboardData.files);
          if (pasted.length) {
            event.preventDefault();
            onAdd(pasted);
          }
        }}
      >
        <Button
          variant="ghost"
          isDisabled={locked}
          onPress={() => input.current?.click()}
          className="h-auto min-h-9 w-full gap-2 whitespace-normal rounded-[8px] border border-dashed border-border bg-transparent py-2 text-xs font-normal text-muted dark:border-[#50505d]"
        >
          <Paperclip className="size-3.5 shrink-0" />
          <Trans>Add files, drop here, or paste an image</Trans>
        </Button>
      </div>
    </div>
  );
}
