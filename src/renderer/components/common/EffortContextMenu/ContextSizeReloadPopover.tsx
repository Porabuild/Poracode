import { useState } from "react";
import { Checkbox } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { setConfirmContextSizeReload } from "@/renderer/state/contextSizeReloadPreference";

/** Confirms a context-size change that reloads an already-started provider session. */
export function ContextSizeReloadPopover(props: {
  anchorPosition: { x: number; y: number };
  contextLabel: string;
  stopsSubagents?: boolean;
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
        <>
          <Trans>
            The agent session reloads to apply the new context size; the conversation is kept.
          </Trans>
          {props.stopsSubagents ? (
            <p className="mt-2">
              <Trans>Any subagents still running when the session reloads will be stopped.</Trans>
            </p>
          ) : null}
        </>
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
