import { Trans } from "@lingui/react/macro";
import type { PrLabel } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailScope } from "../detail/prDetailScope";
import { PrLabelChip } from "../parts/PrLabelChip";
import { LabelPicker } from "./LabelPicker";
import { RailSection } from "./RailSection";
import { useRailMutation } from "./useRailMutation";

const NO_LABELS: readonly PrLabel[] = [];

/** The review's labels, editable where the host supports it. */
export function RailLabels() {
  const scope = usePrDetailScope();
  const labels = useGitStore((s) => s.prDetails[scope.cacheKey]?.labels) ?? NO_LABELS;
  const mutation = useRailMutation();
  const canEdit = scope.scoped?.capabilities.labels === true;
  if (!canEdit && labels.length === 0) return null;

  function apply({ add, remove }: { add: string[]; remove: string[] }) {
    void mutation.run((client) =>
      client.setLabels({ projectLocation: scope.location, prNumber: scope.prNumber, add, remove }),
    );
  }

  return (
    <RailSection
      title={<Trans>Labels</Trans>}
      action={
        canEdit ? (
          <LabelPicker
            current={labels}
            disabled={scope.readOnly || mutation.pending}
            onApply={apply}
          />
        ) : null
      }
    >
      {labels.length === 0 ? (
        <p className="text-xs text-muted">
          <Trans>No labels</Trans>
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <li key={label.name} className="min-w-0">
              <PrLabelChip label={label} />
            </li>
          ))}
        </ul>
      )}
    </RailSection>
  );
}
