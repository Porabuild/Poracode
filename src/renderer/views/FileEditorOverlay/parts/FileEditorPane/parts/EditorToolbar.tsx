import { Code, Eye, Maximize2, Save, X } from "lucide-react";
import { Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { formatCommandShortcut } from "@/renderer/commands/keybindingMatcher";
import { EDITOR_TOGGLE_MARKDOWN_PREVIEW_COMMAND_ID } from "@/shared/keybindings";

export function EditorToolbar(props: {
  isMarkdown: boolean;
  showPreview: boolean;
  onTogglePreview: () => void;
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
    onTogglePreview,
    isDirty,
    activePath,
    onSave,
    onOpenFullscreen,
    onClose,
  } = props;
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const previewShortcut = formatCommandShortcut(
    EDITOR_TOGGLE_MARKDOWN_PREVIEW_COMMAND_ID,
    keybindings,
    readBridge().platform,
  );

  return (
    <>
      {isMarkdown ? (
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <button
              type="button"
              className="rounded p-0.5 text-muted hover:text-foreground"
              aria-label={showPreview ? t`Show source` : t`Show preview`}
              onClick={onTogglePreview}
            >
              {showPreview ? <Code className="size-3" /> : <Eye className="size-3" />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <span className="flex items-center gap-2">
              {showPreview ? <Trans>Show source</Trans> : <Trans>Show preview</Trans>}
              {previewShortcut ? (
                <span className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[11px] text-muted">
                  {previewShortcut}
                </span>
              ) : null}
            </span>
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
