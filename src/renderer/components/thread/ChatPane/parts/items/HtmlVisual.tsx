import { useState } from "react";
import { Button, Modal, Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { AppWindow, Code2, Maximize2 } from "lucide-react";
import { INLINE_VISUAL_FORMAT_VERSION } from "@/shared/inlineVisuals";
import { htmlVisualSourceFits } from "@/shared/htmlVisuals";
import { CopyTextButton } from "./CopyTextButton";
import { HtmlVisualFrame } from "./HtmlVisualFrame";
import { InlineVisual } from "./InlineVisual";
import { useMcpAppSandboxEndpoint } from "./mcpAppSandboxEndpoint";
import { VisualSource } from "./VisualSource";

interface HtmlVisualProps {
  html: string;
  title: string;
  version: number;
  complete: boolean;
  isStreaming: boolean;
  limited: boolean;
}

/**
 * A finished `poracode-html-v1` block runs only inside the host-managed
 * sandbox. Streaming, unfinished, unknown, oversized, and unrenderable blocks
 * stay inert source.
 */
export function HtmlVisual({
  html,
  title,
  version,
  complete,
  isStreaming,
  limited,
}: HtmlVisualProps) {
  const { t } = useLingui();
  const endpoint = useMcpAppSandboxEndpoint();
  const [failed, setFailed] = useState<{ endpoint: string; html: string }>();
  if (isStreaming || !complete)
    return <InlineVisual html={html} title={title} complete={complete} isStreaming={isStreaming} />;
  const status =
    version !== INLINE_VISUAL_FORMAT_VERSION
      ? t`Unsupported HTML format. Showing source only.`
      : limited
        ? t`Too many HTML previews in this message. Showing source only.`
        : !htmlVisualSourceFits(html)
          ? t`This HTML block is too large to preview. Showing source only.`
          : undefined;
  const unavailable = failed !== undefined && failed.endpoint === endpoint && failed.html === html;
  if (status || !endpoint || unavailable)
    return <InlineVisual html={html} title={title} {...(status ? { status } : {})} />;
  return (
    <HtmlVisualPreview
      key={endpoint}
      html={html}
      title={title}
      endpoint={endpoint}
      onUnavailable={() => setFailed({ endpoint, html })}
    />
  );
}

function HtmlVisualPreview({
  html,
  title,
  endpoint,
  onUnavailable,
}: {
  html: string;
  title: string;
  endpoint: string;
  onUnavailable: () => void;
}) {
  const { t } = useLingui();
  const label = title || t`HTML preview`;
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  return (
    <div
      data-poracode-html-visual="true"
      className="not-prose @container my-2 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <div className="flex flex-wrap items-center gap-x-1 border-b border-border px-2 py-1 @min-[480px]:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
          <AppWindow className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span title={label} className="min-w-0 truncate text-xs font-medium">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              setShowSource(!showSource);
              setReady(false);
            }}
          >
            <Code2 className="size-3.5" aria-hidden="true" />
            {showSource ? t`Preview` : t`Source`}
          </Button>
          <CopyTextButton text={html} label={t`Copy source`} />
          <Tooltip delay={300}>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={t`Expand visual`}
              onPress={() => setExpanded(true)}
            >
              <Maximize2 className="size-3.5" />
            </Button>
            <Tooltip.Content>{t`Expand visual`}</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      {showSource ? (
        <div className="max-h-[70vh] overflow-auto p-3">
          <VisualSource text={html} lang="html" />
        </div>
      ) : (
        <>
          {ready ? null : (
            <p role="status" className="px-3 py-2 text-xs text-muted">
              {t`Loading preview…`}
            </p>
          )}
          <HtmlVisualFrame
            key={html}
            html={html}
            title={label}
            endpoint={endpoint}
            onReady={() => setReady(true)}
            onUnavailable={onUnavailable}
          />
        </>
      )}
      <Modal.Backdrop isOpen={expanded} onOpenChange={setExpanded}>
        <Modal.Container size="full" scroll="inside">
          <Modal.Dialog aria-label={label}>
            <Modal.CloseTrigger aria-label={t`Close expanded visual`} />
            <Modal.Header className="border-b border-border">
              <Modal.Heading>{label}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex min-h-0 flex-1 flex-col bg-background p-0">
              {expanded ? (
                <HtmlVisualFrame
                  key={html}
                  html={html}
                  title={label}
                  endpoint={endpoint}
                  fill
                  onUnavailable={() => setExpanded(false)}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
