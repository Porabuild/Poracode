import { Trans } from "@lingui/react/macro";
import type { ThreadImportedFrom } from "@/shared/contracts";
import { sessionImportProviderLabel } from "@/renderer/components/sessionImport/providerInfo";

/**
 * A one-line provenance marker above an imported transcript. The replayed rows
 * are text only, so the reader needs to know the original conversation had
 * tool calls the pane is not showing — and where the file lives. The agent
 * itself still has the full history: the thread resumes the real session.
 */
export function ImportedThreadNotice(props: { importedFrom: ThreadImportedFrom }) {
  const providerLabel = sessionImportProviderLabel(props.importedFrom.provider);
  return (
    <p className="px-3 py-2 text-[11px] text-muted">
      <Trans>Imported from {providerLabel} — text only, tool calls are not shown.</Trans>{" "}
      <span className="font-mono" title={props.importedFrom.path}>
        {props.importedFrom.path.split(/[\\/]/u).at(-1)}
      </span>
    </p>
  );
}
