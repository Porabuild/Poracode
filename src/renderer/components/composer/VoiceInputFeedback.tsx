import { Popover } from "@heroui/react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
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
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        isIconOnly
        aria-label={t`Voice input needs attention`}
        size="sm"
        variant="ghost"
        className="text-danger"
      >
        <AlertCircle className="size-4" />
      </Button>
      <Popover.Content placement="top" className="w-80 max-w-[calc(100vw-2rem)] p-3">
        <Popover.Dialog>
          <Popover.Heading className="text-sm font-medium">
            <Trans>Voice input needs attention</Trans>
          </Popover.Heading>
          <p role="alert" className="mt-2 text-xs text-muted">
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
              onPress={() => {
                setOpen(false);
                usePanelStore.getState().openSettingsSection("audio");
              }}
            >
              <Trans>Audio settings</Trans>
            </Button>
            <Button size="sm" variant="ghost" onPress={onDiscard}>
              {failure.canRetry ? t`Discard recording` : t`Dismiss`}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
