import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { usePr } from "./prContext";
import { PrPageHeader } from "./PrPageHeader";

/**
 * Shared shell for a PR deep page: the back-to-overview header plus a single
 * scroll wrapper around the page's content component.
 */
export function PrSubPage(props: {
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const { t } = useLingui();
  const pr = usePr();
  return (
    <>
      <PrPageHeader
        title={props.title}
        onBack={pr.toOverview}
        backLabel={t`Back to overview`}
        {...(props.actions ? { actions: props.actions } : {})}
      />
      <div className={props.className}>{props.children}</div>
    </>
  );
}
