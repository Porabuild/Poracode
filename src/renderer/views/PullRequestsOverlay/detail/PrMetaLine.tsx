import { ArrowRight } from "lucide-react";
import { Plural, useLingui } from "@lingui/react/macro";
import type { PrDetails } from "@/shared/contracts";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { PrAvatar } from "../parts/PrAvatar";

/** Authorship line: author, age, head → base and the size of the change. */
export function PrMetaLine(props: { details: PrDetails }) {
  const { t } = useLingui();
  const { details } = props;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {details.author ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <PrAvatar author={details.author} size="sm" />
          <span className="truncate font-medium text-foreground">{details.author.login}</span>
        </span>
      ) : null}
      {details.createdAt ? (
        <span>
          <RelativeTime iso={details.createdAt} />
        </span>
      ) : null}
      <span aria-hidden>·</span>
      <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px]">
        <span className="min-w-0 max-w-48 truncate rounded bg-default-100 px-1.5 py-0.5 text-foreground">
          {details.headBranch}
        </span>
        <ArrowRight className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 max-w-48 truncate rounded bg-default-100 px-1.5 py-0.5 text-foreground">
          {details.baseBranch}
        </span>
      </span>
      <span aria-hidden>·</span>
      <span
        className="tabular-nums"
        aria-label={t`${details.additions} additions and ${details.deletions} deletions`}
      >
        <span className="text-success">+{details.additions}</span>{" "}
        <span className="text-danger">−{details.deletions}</span>{" "}
        <span className="text-muted">
          · <Plural value={details.changedFiles} one="# file" other="# files" />
        </span>
      </span>
    </div>
  );
}
