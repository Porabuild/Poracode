import { Plural, Trans } from "@lingui/react/macro";
import type { PermissionRequestDetails } from "@/shared/contracts";
import { PathDisplay } from "@/renderer/components/common/PathDisplay";
import { formatInputSubject, type OpenCodePermissionDetails } from "../helpers";

export function OpenCodePermissionDetailsLine({ details }: { details: OpenCodePermissionDetails }) {
  const metadataEntries = details.metadata
    ? Object.entries(details.metadata).filter(([, v]) => v !== undefined && v !== null)
    : [];
  return (
    <div className="mt-0.5 space-y-0.5 font-mono text-[11px]">
      <div>
        <span className="text-foreground/60">
          <Trans>permission</Trans>
        </span>
        <span className="ml-1 text-foreground">{details.permission}</span>
      </div>
      {details.patterns.length > 0 ? (
        <div className="whitespace-pre-wrap break-words">
          <span className="text-foreground/60">
            <Plural value={details.patterns.length} one="target" other="targets" />
          </span>
          <span className="ml-1 text-foreground">{details.patterns.join(", ")}</span>
        </div>
      ) : null}
      {metadataEntries.map(([key, value]) => (
        <div key={key} className="whitespace-pre-wrap break-words">
          <span className="text-foreground/60">{key}</span>
          <span className="ml-1 text-foreground">
            {typeof value === "string" ? value : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PermissionDetailsLine({ details }: { details: PermissionRequestDetails }) {
  const subject = formatInputSubject(details.input);
  const label = details.displayName ?? details.toolName;
  return (
    <div className="mt-0.5 space-y-0.5">
      <div className="font-mono text-[11px] whitespace-pre-wrap break-words text-foreground/60">
        <span>{label}</span>
        {subject ? <span className="ml-1">{subject}</span> : null}
      </div>
      {details.decisionReason ? (
        <div className="text-[11px] text-warning-600 dark:text-warning-400">
          {details.decisionReason}
        </div>
      ) : null}
      {details.blockedPath ? (
        <div className="font-mono text-[11px] whitespace-pre-wrap break-words text-foreground/60">
          <Trans>blocked:</Trans> <span className="text-foreground/80">{details.blockedPath}</span>
        </div>
      ) : null}
    </div>
  );
}

export function PlanFileLine(props: { path: string }) {
  const { path } = props;
  return (
    <div className="mt-1 flex min-w-0 items-center gap-2">
      <PathDisplay
        path={path}
        className="min-w-0 flex-1 font-mono text-[11px]"
        basenameClassName="text-foreground/80"
        dirClassName="text-muted/60"
      />
    </div>
  );
}
