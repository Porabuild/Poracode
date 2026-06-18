import { Globe } from "lucide-react";
import { Trans } from "@lingui/react/macro";

export function BrowserEmptyState(props: { onCreateTab: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-foreground/60">
      <Globe className="size-8 text-accent/60" />
      <div className="text-sm">
        <Trans>No browser tab open</Trans>
      </div>
      <button
        type="button"
        className="rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-[color:var(--accent-foreground)] hover:opacity-90"
        onClick={props.onCreateTab}
      >
        <Trans>Open new tab</Trans>
      </button>
    </div>
  );
}
