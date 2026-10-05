import { Trans } from "@lingui/react/macro";
import { ImportSessionsPanel } from "@/renderer/components/sessionImport/ImportSessionsPanel";

/** Settings → Import: every discovered session across agents and profiles. */
export function ImportSettings() {
  return (
    <div className="flex flex-col gap-4 border-t border-border/10 pt-4">
      <div>
        <p className="text-sm font-medium text-foreground">
          <Trans>Import sessions</Trans>
        </p>
        <p className="text-xs text-muted">
          <Trans>
            Bring conversations you started in an agent CLI into Poracode. Transcript files are
            read, never modified.
          </Trans>
        </p>
      </div>
      <ImportSessionsPanel />
    </div>
  );
}
