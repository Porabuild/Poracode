import { useState } from "react";
import { Checkbox } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ConfirmationPopover } from "@/renderer/components/common/ConfirmationPopover";
import { setConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";

export function DeleteThreadPopover(props: {
  isOpen: boolean;
  anchorPosition: { x: number; y: number };
  /** Set only when confirming also removes the worktree directory. */
  worktreeBranch?: string;
  returnFocusElement?: HTMLElement;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const [dontAskAgain, setDontAskAgain] = useState(false);

  function handleDelete() {
    if (dontAskAgain) setConfirmThreadDelete(false);
    props.onDelete();
  }

  return (
    <ConfirmationPopover
      isOpen={props.isOpen}
      onOpenChange={(open) => !open && props.onClose()}
      anchorPosition={props.anchorPosition}
      className="w-80 max-w-[calc(100vw-16px)]"
      {...(props.returnFocusElement ? { returnFocusElement: props.returnFocusElement } : {})}
      title={t`Delete thread?`}
      body={
        props.worktreeBranch ? (
          <Trans>
            This will permanently delete the thread and remove worktree{" "}
            <strong className="font-medium text-foreground">{props.worktreeBranch}</strong>.
          </Trans>
        ) : (
          <Trans>This will permanently delete the thread.</Trans>
        )
      }
      actions={[
        {
          label: t`Delete`,
          variant: "danger",
          onPress: handleDelete,
        },
      ]}
    >
      <Checkbox isSelected={dontAskAgain} onChange={setDontAskAgain}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Trans>Don&apos;t ask again</Trans>
        </Checkbox.Content>
      </Checkbox>
    </ConfirmationPopover>
  );
}
