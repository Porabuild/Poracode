import { useState, type ReactNode } from "react";
import { Label, Modal, TextField, Tooltip, toast } from "@heroui/react";
import { Pause, Pencil, Play, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { MAX_GOAL_OBJECTIVE_LENGTH, type ThreadGoalControl } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { Button, TextArea } from "@/renderer/components/common";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { ThreadGoalDockState } from "./threadGoalState";

interface ThreadGoalControlsProps {
  threadId: string;
  state: ThreadGoalDockState;
  onDismiss: () => void;
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
      const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
      if (thread?.remoteServerId && thread.remoteId) {
        await useRemoteServersStore.getState().controlThreadGoal(thread.remoteServerId, {
          threadId: thread.remoteId,
          ...control,
        });
      } else {
        await readBridge().controlThreadGoal({ threadId, ...control });
      }
      return true;
    } catch {
      toast.danger(control.action === "clear" ? t`Failed to clear goal` : t`Failed to update goal`);
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
        <GoalControlButton
          label={t`Edit goal`}
          pending={pendingAction === "edit"}
          disabled={pendingAction !== null}
          onPress={openEditor}
        >
          <Pencil className="size-3.5" />
        </GoalControlButton>
      ) : null}
      {availableActions.includes("pause") ? (
        <GoalControlButton
          label={t`Pause goal`}
          pending={pendingAction === "pause"}
          disabled={pendingAction !== null}
          onPress={() => void controlGoal({ action: "pause" })}
        >
          <Pause className="size-3.5" />
        </GoalControlButton>
      ) : null}
      {availableActions.includes("resume") ? (
        <GoalControlButton
          label={t`Resume goal`}
          pending={pendingAction === "resume"}
          disabled={pendingAction !== null}
          onPress={() => void controlGoal({ action: "resume" })}
        >
          <Play className="size-3.5" />
        </GoalControlButton>
      ) : null}
      {availableActions.includes("clear") ? (
        <GoalControlButton
          label={t`Clear goal`}
          pending={pendingAction === "clear"}
          disabled={pendingAction !== null}
          danger
          onPress={() => void controlGoal({ action: "clear" })}
        >
          <X className="size-3.5" />
        </GoalControlButton>
      ) : (
        <GoalControlButton label={t`Close goal`} onPress={onDismiss}>
          <X className="size-3.5" />
        </GoalControlButton>
      )}
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

function GoalControlButton({
  label,
  pending = false,
  disabled = false,
  danger = false,
  onPress,
  children,
}: {
  label: string;
  pending?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          className={
            danger
              ? "h-6 w-6 min-w-0 shrink-0 text-muted/70 hover:bg-danger-500/10 hover:text-danger-500"
              : "h-6 w-6 min-w-0 shrink-0 text-muted/70"
          }
          isDisabled={disabled}
          isPending={pending}
          onPress={onPress}
        >
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
