import { useGitStore } from "@/renderer/state/gitStore";
import { usePrChecksStatus } from "@/renderer/state/gitSelectors";
import { aggregatePrChecksStatus, combineChecksStatus } from "@/renderer/utils/prStatus";

export function usePrCombinedChecksStatus(prKey: string | undefined, cacheKey: string | undefined) {
  const prChecksStatus = usePrChecksStatus(prKey);
  const detailsChecks = useGitStore((s) => (cacheKey ? s.prDetails[cacheKey]?.checks : undefined));
  const detailsChecksStatus = aggregatePrChecksStatus(detailsChecks);
  return combineChecksStatus(detailsChecksStatus, prChecksStatus);
}
