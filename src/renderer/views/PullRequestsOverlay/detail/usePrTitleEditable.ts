import { useGitStore } from "@/renderer/state/gitStore";
import { usePrDetailScope } from "./prDetailScope";

/** Whether the viewer may rename the review: a loaded, writable review on a host that allows edits. */
export function usePrTitleEditable(): boolean {
  const scope = usePrDetailScope();
  const details = useGitStore((s) => s.prDetails[scope.cacheKey]);
  return (
    !scope.readOnly &&
    (details?.source ?? scope.source)?.capabilities.edit === true &&
    details?.number === scope.prNumber
  );
}
