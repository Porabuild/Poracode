import { Popover, Tooltip } from "@heroui/react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import { floatingGlassSurfaceClass } from "@/renderer/components/layout/floatingGlass";
import { usePanelStore } from "@/renderer/state/panelStore";

export interface VoiceInputFailure {
  message: string;
  canRetry: boolean;
}

export function VoiceInputFeedback({
  failure,
  onRetry,
  onDiscard,
  isDisabled,
}: {
  failure: VoiceInputFailure;
  onRetry: () => void;
  onDiscard: () => void;
  isDisabled: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(true);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !failure.canRetry) {
      onDiscard();
      return;
    }
    setOpen(nextOpen);
  };
  return (
    <Popover isOpen={open} onOpenChange={handleOpenChange}>
      <Tooltip delay={300} isDisabled={open}>
        <Tooltip.Trigger tabIndex={-1} role="none" className="inline-flex">
          <Button
            isIconOnly
            aria-label={t`Voice input needs attention`}
            size="sm"
            variant="ghost"
            className="poracode-composer-menu min-w-9 px-2 text-danger"
          >
            <AlertCircle className="size-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content
          placement="top"
          className={`${floatingGlassSurfaceClass} pointer-events-none rounded-4xl px-2.5 py-1.5 text-xs font-normal`}
        >
          {t`Voice input needs attention`}
        </Tooltip.Content>
      </Tooltip>
      <Popover.Content placement="top end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Popover.Dialog className="p-3 normal-case tracking-normal">
          <Popover.Heading className="text-sm font-medium text-foreground">
            <Trans>Voice input needs attention</Trans>
          </Popover.Heading>
          <p role="alert" className="mt-1 text-xs text-muted">
            {failure.message}
          </p>
          {failure.canRetry && (
            <p className="mt-2 text-xs text-muted">
              <Trans>
                Your recording is kept in memory for two minutes. Retry uses the same model and
                host.
              </Trans>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {failure.canRetry && (
              <Button size="sm" variant="tertiary" isDisabled={isDisabled} onPress={onRetry}>
                <Trans>Retry transcription</Trans>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted"
              onPress={() => {
                setOpen(false);
                usePanelStore.getState().openSettingsSection("audio");
              }}
            >
              <Trans>Audio settings</Trans>
            </Button>
            <Button size="sm" variant="ghost" className="text-muted" onPress={onDiscard}>
              {failure.canRetry ? t`Discard recording` : t`Dismiss`}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
