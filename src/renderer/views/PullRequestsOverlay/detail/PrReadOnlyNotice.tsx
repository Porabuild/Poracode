import { useLingui } from "@lingui/react/macro";
import { usePrDetailScope } from "./prDetailScope";

/** Says why a review shown read-only cannot be changed (offline snapshot, still loading). */
export function PrReadOnlyNotice(props: { className: string; suppressLoading?: boolean }) {
  const { t } = useLingui();
  const scope = usePrDetailScope();
  if (!scope.readOnly) return null;
  if (props.suppressLoading && scope.loading && !scope.cached) return null;
  return (
    <p role="status" className={props.className}>
      {scope.cached
        ? t`Offline snapshot, read-only.`
        : scope.loading
          ? t`Loading…`
          : t`Showing the last loaded version. Read-only until it refreshes.`}
    </p>
  );
}
