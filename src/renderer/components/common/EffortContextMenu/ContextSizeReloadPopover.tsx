import { useState } from "react";
import { Checkbox } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { setConfirmContextSizeReload } from "@/renderer/state/contextSizeReloadPreference";

/** Confirms a context-size change that reloads an already-started provider session. */
export function ContextSizeReloadPopover(props: {
  anchorPosition: { x: number; y: number };
  contextLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLingui();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { contextLabel } = props;

  function handleConfirm() {
    if (dontShowAgain) setConfirmContextSizeReload(false);
    props.onConfirm();
  }

  return (
    <ConfirmationPopover
      isOpen
      onOpenChange={(open) => !open && props.onCancel()}
      anchorPosition={props.anchorPosition}
      placement="top start"
      className="w-80 max-w-[calc(100vw-16px)]"
      title={t`Change context size to ${contextLabel}?`}
      body={
        <Trans>
          The new context size applies from your next message. The agent session reloads before that
          message is sent; the conversation is kept.
        </Trans>
      }
      actions={[{ label: t`Change`, onPress: handleConfirm }]}
    >
      <Checkbox isSelected={dontShowAgain} onChange={setDontShowAgain}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Trans>Don&apos;t show again</Trans>
        </Checkbox.Content>
      </Checkbox>
    </ConfirmationPopover>
  );
}
