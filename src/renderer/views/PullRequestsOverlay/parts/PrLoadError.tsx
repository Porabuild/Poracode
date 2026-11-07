import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";

/** A failed review load, with a way to try again. */
export function PrLoadError(props: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted"
    >
      <span>{props.message}</span>
      <Button size="sm" variant="tertiary" onPress={props.onRetry}>
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
}
