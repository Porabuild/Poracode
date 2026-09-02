import { useState } from "react";
import { Label, Modal, TextField, toast } from "@heroui/react";
import { Pause, Pencil, Play, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MAX_GOAL_OBJECTIVE_LENGTH, type ThreadGoalControl } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import { Button, TextArea } from "@/renderer/components/common";
import { ThreadDockIconButton } from "./ThreadDockUI";
import type { ThreadGoalDockState } from "./threadGoalState";

interface ThreadGoalControlsProps {
  threadId: string;
  state: ThreadGoalDockState;
  onDismiss?: () => void;
}

export function ThreadGoalControls({ threadId, state, onDismiss }: ThreadGoalControlsProps) {
  const { t } = useLingui();
  const [pendingAction, setPendingAction] = useState<ThreadGoalControl["action"] | null>(null);
  const [objectiveDraft, setObjectiveDraft] = useState<string | null>(null);
  const availableActions = state.availableActions ?? [];
  const normalizedObjective = objectiveDraft?.trim() ?? "";

  const controlGoal = async (control: ThreadGoalControl): Promise<boolean> => {
    setPendingAction(control.action);
    try {
      await readBridge().controlThreadGoal({ threadId, ...control });
      return true;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const openEditor = () => {
    setObjectiveDraft(state.objective);
  };

  const saveObjective = async () => {
    if (!normalizedObjective || normalizedObjective === state.objective) return;
    if (await controlGoal({ action: "edit", objective: normalizedObjective })) {
      setObjectiveDraft(null);
    }
  };

  return (
    <>
      {availableActions.includes("edit") ? (
        <ThreadDockIconButton
          label={t`Edit goal`}
          isPending={pendingAction === "edit"}
          isDisabled={pendingAction !== null}
          onPress={openEditor}
        >
          <Pencil className="size-3.5" />
        </ThreadDockIconButton>
      ) : null}
      {availableActions.includes("pause") ? (
        <ThreadDockIconButton
          label={t`Pause goal`}
          isPending={pendingAction === "pause"}
          isDisabled={pendingAction !== null}
          onPress={() => void controlGoal({ action: "pause" })}
        >
          <Pause className="size-3.5" />
        </ThreadDockIconButton>
      ) : null}
      {availableActions.includes("resume") ? (
        <ThreadDockIconButton
          label={t`Resume goal`}
          isPending={pendingAction === "resume"}
          isDisabled={pendingAction !== null}
          onPress={() => void controlGoal({ action: "resume" })}
        >
          <Play className="size-3.5" />
        </ThreadDockIconButton>
      ) : null}
      {availableActions.includes("clear") ? (
        <ThreadDockIconButton
          label={t`Clear goal`}
          isPending={pendingAction === "clear"}
          isDisabled={pendingAction !== null}
          danger
          onPress={() => void controlGoal({ action: "clear" })}
        >
          <X className="size-3.5" />
        </ThreadDockIconButton>
      ) : onDismiss ? (
        <ThreadDockIconButton label={t`Close goal`} onPress={onDismiss}>
          <X className="size-3.5" />
        </ThreadDockIconButton>
      ) : null}
      {objectiveDraft !== null ? (
        <Modal.Backdrop isOpen onOpenChange={(open) => !open && setObjectiveDraft(null)}>
          <Modal.Container placement="center" size="md">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  <Trans>Edit goal</Trans>
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="p-4">
                <TextField>
                  <Label>
                    <Trans>Goal objective</Trans>
                  </Label>
                  <TextArea
                    autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- opened edit dialog, expected focus target
                    maxLength={MAX_GOAL_OBJECTIVE_LENGTH}
                    rows={5}
                    value={objectiveDraft}
                    onChange={(event) => setObjectiveDraft(event.target.value)}
                  />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="ghost" size="sm" className="text-muted">
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="tertiary"
                  size="sm"
                  className="text-white"
                  isDisabled={!normalizedObjective || normalizedObjective === state.objective}
                  isPending={pendingAction === "edit"}
                  onPress={() => void saveObjective()}
                >
                  <Trans>Save</Trans>
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}
    </>
  );
}
