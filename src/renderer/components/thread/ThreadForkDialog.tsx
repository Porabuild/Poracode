import { useState } from "react";
import { Input, Label, Modal, TextField } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { friendlyError } from "@/shared/messages";
import { canForkThread } from "@/shared/threadFork";
import { useThread } from "@/renderer/state/useThread";
import { useThreadForkStore } from "@/renderer/state/threadForkStore";
import { createThreadFork } from "@/renderer/actions/threadForkActions";
import { Button } from "@/renderer/components/common/Button";

export function ThreadForkDialog({
  sourceThreadId,
  throughItemId,
}: {
  sourceThreadId: string;
  throughItemId: string | undefined;
}) {
  const { t } = useLingui();
  const source = useThread(sourceThreadId);
  const [title, setTitle] = useState(() => (source ? t`${source.title} (fork)` : ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState<Parameters<typeof createThreadFork>[0] | null>(null);
  const close = useThreadForkStore((state) => state.close);

  async function createFork() {
    if (pending || !source || !title.trim() || (!attempt && !canForkThread(source))) return;
    const currentAttempt = attempt ?? {
      source,
      title: title.trim(),
      ...(throughItemId ? { throughItemId } : {}),
      threadId: crypto.randomUUID(),
      commandId: crypto.randomUUID(),
    };
    setAttempt(currentAttempt);
    setPending(true);
    setError(undefined);
    try {
      await createThreadFork(currentAttempt);
      close();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && !pending && close()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[460px]">
          <Modal.CloseTrigger isDisabled={pending} />
          <Modal.Header>
            <Modal.Heading>
              <Trans>Fork thread</Trans>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3 p-4">
            <p className="text-sm text-muted">
              <Trans>
                Creates an independent conversation through a completed turn. Files stay in the same
                checkout.
              </Trans>
            </p>
            <TextField>
              <Label>
                <Trans>Thread name</Trans>
              </Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending || attempt !== null}
              />
            </TextField>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="ghost" className="text-muted" isDisabled={pending}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="tertiary"
              isPending={pending}
              isDisabled={!source || !title.trim() || (!attempt && !canForkThread(source))}
              onPress={() => void createFork()}
            >
              <Trans>Create fork</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
