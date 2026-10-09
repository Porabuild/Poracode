import { Trans } from "@lingui/react/macro";
import type { ThreadImportedFrom } from "@/shared/contracts";
import { getBasename } from "@/shared/pathUtils";

/** Provenance line above an imported transcript, which replays text only. */
export function ImportedThreadNotice(props: { importedFrom: ThreadImportedFrom }) {
  return (
    <p className="px-3 py-2 text-[11px] text-muted">
      <Trans>Imported from an existing CLI session — text only, tool calls are not shown.</Trans>{" "}
      <span className="font-mono" title={props.importedFrom.path}>
        {getBasename(props.importedFrom.path)}
      </span>
    </p>
  );
}
