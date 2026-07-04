import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft } from "lucide-react";

/** Shared back-header chrome for the PR overview and its deep pages. */
export function PrPageHeader(props: {
  readonly title: ReactNode;
  readonly onBack: () => void;
  readonly backLabel?: string;
  readonly actions?: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <header className="m-git-head">
      <button
        className="m-back"
        type="button"
        aria-label={props.backLabel ?? t`Back`}
        onClick={props.onBack}
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="m-git-head__title">
        <span className="m-git-head__branch">{props.title}</span>
      </span>
      {props.actions ? <span className="m-git-head__actions">{props.actions}</span> : null}
    </header>
  );
}
