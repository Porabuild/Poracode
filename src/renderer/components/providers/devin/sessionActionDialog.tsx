import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { DevinReviseForm } from "./sessionReviseForm";
import {
  DevinListingPanel,
  DevinRuleEntry,
  type DevinListingState,
  type DevinRuleEntryView,
} from "./sessionListings";
import { DEVIN_SESSION_ACTION_IDS } from "./sessionActionIds";

export type DevinSessionPanel = "revise" | "rules";

/** One compact dialog, opened after the add menu closes, avoids nested overlays. */
export function DevinSessionActionDialog(props: {
  panel: DevinSessionPanel;
  onClose: () => void;
  pendingAction: string | undefined;
  submitRevise: (command: string, note: string) => void;
  reviseResult: string | undefined;
  insertReviseResult: () => void;
  discardReviseResult: () => void;
  rules: DevinListingState<DevinRuleEntryView>;
  isDisabled: boolean;
}) {
  const { t } = useLingui();
  const titles = {
    revise: t`Revise command`,
    rules: t`Rules`,
  };
  return (
    <Modal>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[460px]" aria-label={titles[props.panel]}>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{titles[props.panel]}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-4">
              {props.panel === "revise" ? (
                props.reviseResult !== undefined ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      <Trans>Suggested command — review before use</Trans>
                    </p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-secondary px-3 py-2 font-mono text-xs">
                      {props.reviseResult}
                    </pre>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        className="text-muted"
                        onPress={props.discardReviseResult}
                      >
                        <Trans>Discard</Trans>
                      </Button>
                      <Button
                        variant="tertiary"
                        isDisabled={props.isDisabled}
                        onPress={props.insertReviseResult}
                      >
                        <Trans>Insert into composer</Trans>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DevinReviseForm
                    isDisabled={props.isDisabled}
                    isPending={props.pendingAction === DEVIN_SESSION_ACTION_IDS.revise}
                    onSubmit={props.submitRevise}
                  />
                )
              ) : null}
              {props.panel === "rules" ? (
                <DevinListingPanel
                  title={t`Rules in this session`}
                  emptyText={t`No rules were listed for this session.`}
                  malformedText={t`The session returned a rules listing Poracode could not interpret.`}
                  state={props.rules}
                  renderEntry={(entry) => (
                    <DevinRuleEntry key={`${entry.name}:${entry.path}`} entry={entry} />
                  )}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
