import { Code, Eye, Maximize2, Save, X } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";

export function EditorToolbar(props: {
  isMarkdown: boolean;
  showPreview: boolean;
  setShowPreview: (v: boolean | ((v: boolean) => boolean)) => void;
  isDirty: boolean;
  activePath: string | null;
  onSave: () => void;
  onOpenFullscreen?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const {
    isMarkdown,
    showPreview,
    setShowPreview,
    isDirty,
    activePath,
    onSave,
    onOpenFullscreen,
    onClose,
  } = props;

  return (
    <>
      {isMarkdown ? (
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <button
              type="button"
              className="rounded p-0.5 text-muted hover:text-foreground"
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? <Code className="size-3" /> : <Eye className="size-3" />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            {showPreview ? <Trans>Show source</Trans> : <Trans>Show preview</Trans>}
          </Tooltip.Content>
        </Tooltip>
      ) : null}
      {activePath ? (
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <button
              type="button"
              className={`rounded p-0.5 ${isDirty ? "text-foreground" : "text-muted/40 pointer-events-none"}`}
              onClick={onSave}
            >
              <Save className="size-3" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Trans>Save</Trans>
          </Tooltip.Content>
        </Tooltip>
      ) : null}
      {onOpenFullscreen ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted hover:text-foreground"
          title={t`Open fullscreen`}
          onClick={onOpenFullscreen}
        >
          <Maximize2 className="size-3" />
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted hover:text-foreground"
          title={t`Close editor`}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </>
  );
}
