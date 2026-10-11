import { useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@/renderer/components/common";

/**
 * Two-field form for the revise action: the command to revise plus an
 * optional note. Purely presentational — the caller owns validation, the
 * guarded invoke, and the review step that follows.
 */
export function DevinReviseForm(props: {
  isPending: boolean | undefined;
  isDisabled: boolean;
  onSubmit: (command: string, note: string) => void;
}) {
  const { t } = useLingui();
  const [command, setCommand] = useState("");
  const [note, setNote] = useState("");
  const trimmedCommand = command.trim();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmedCommand || props.isPending || props.isDisabled) return;
        props.onSubmit(trimmedCommand, note.trim());
      }}
    >
      <Input
        aria-label={t`Command to revise`}
        className="min-w-0 font-mono text-sm"
        placeholder={t`Command to revise`}
        value={command}
        disabled={props.isDisabled || props.isPending === true}
        onChange={(event) => setCommand(event.target.value)}
      />
      <Input
        aria-label={t`Revision note (optional)`}
        className="min-w-0 text-sm"
        placeholder={t`What should change? (optional)`}
        value={note}
        disabled={props.isDisabled || props.isPending === true}
        onChange={(event) => setNote(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="tertiary"
        className="px-3"
        isDisabled={props.isDisabled || !trimmedCommand}
        isPending={props.isPending === true}
      >
        <Trans>Get suggestion</Trans>
      </Button>
      <p className="text-xs text-muted">
        <Trans>Devin proposes a revised command; you review it before anything runs.</Trans>
      </p>
    </form>
  );
}
