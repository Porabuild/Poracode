import { useLingui } from "@lingui/react/macro";
import { Code2 } from "lucide-react";
import { VisualSource } from "./VisualSource";
import { CopyTextButton } from "./CopyTextButton";

interface InlineVisualProps {
  html: string;
  title?: string;
  complete?: boolean;
  isStreaming?: boolean;
}

export function InlineVisual({
  html,
  title,
  complete = true,
  isStreaming = false,
}: InlineVisualProps) {
  const { t } = useLingui();
  const label = title || t`HTML source`;
  return (
    <div
      data-poracode-inline-visual="true"
      className="not-prose my-2 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 py-1">
        <Code2 className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={label}>
          {label}
        </span>
        <CopyTextButton text={html} label={t`Copy source`} />
      </div>
      <p className="border-b border-border px-3 py-2 text-xs text-muted" role="status">
        {isStreaming
          ? t`Receiving HTML source…`
          : !complete
            ? t`Incomplete HTML block. Showing source only.`
            : t`Interactive rendering is unavailable. Showing source only.`}
      </p>
      <div className="max-h-[70vh] overflow-auto p-3">
        <VisualSource text={html} lang="html" isStreaming={isStreaming} />
      </div>
    </div>
  );
}
