import type { ElementType } from "react";
import { ShieldOff } from "lucide-react";
import { Button, Switch } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import type { PrMergeMethod } from "@/shared/contracts";
import type { PrMergeFlow } from "./usePrMergeFlow";

export function MergeMethodLabel(props: { method: PrMergeMethod }) {
  if (props.method === "merge") return <Trans>Merge commit</Trans>;
  if (props.method === "rebase") return <Trans>Rebase and merge</Trans>;
  return <Trans>Squash and merge</Trans>;
}

/**
 * The merge confirmation: what merging does, why it is blocked (with the admin
 * bypass where the host offers one), and the confirm / cancel pair. Merging is not
 * undoable, so every merge entry point asks through this body first.
 */
export function PrMergeConfirm(props: {
  flow: PrMergeFlow;
  /** The element naming the confirmation (a dialog heading where the surface has one). */
  heading?: ElementType;
  /** Name the method in the confirmation (a surface that already shows it picks `false`). */
  showMethod?: boolean;
}) {
  const { flow } = props;
  const Heading = props.heading ?? "p";
  const { isBlocked, isSoftBlock, canBypass, blockReason, mergeMethods } = flow.readiness;
  return (
    <div className="space-y-3 p-3">
      {props.showMethod === false ? null : (
        <Heading className="text-xs font-medium text-foreground">
          <MergeMethodLabel method={flow.selected} />
        </Heading>
      )}
      <p className="text-xs text-muted">
        <Trans>
          The review's changes are merged into its base branch. This cannot be undone here.
        </Trans>
      </p>
      {isBlocked ? (
        <div className={`space-y-1.5 text-xs ${isSoftBlock ? "text-warning" : "text-danger"}`}>
          {blockReason ? <p>{blockReason}</p> : null}
          {canBypass ? (
            <Switch size="sm" isSelected={flow.bypass} onChange={flow.setBypass}>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content className="flex items-center gap-1">
                <ShieldOff className="size-3" aria-hidden />
                <Trans>Bypass branch protection (admin merge)</Trans>
              </Switch.Content>
            </Switch>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onPress={flow.dismiss}>
          <Trans>Cancel</Trans>
        </Button>
        <Button
          size="sm"
          variant="primary"
          isDisabled={flow.disabled || !mergeMethods.includes(flow.selected)}
          onPress={flow.confirm}
        >
          <Trans>Confirm merge</Trans>
        </Button>
      </div>
    </div>
  );
}
