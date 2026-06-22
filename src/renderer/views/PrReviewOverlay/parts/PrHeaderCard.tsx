import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { useGitStore } from "@/renderer/state/gitStore";
import { ItemMarkdown } from "@/renderer/components/thread/ChatPane/parts/items/ItemMarkdown";

/** Centred tab pill + collapsible PR description body. */
export function PrHeaderCard(props: {
  cacheKey: string;
  /** Tab pill rendered centred above the description. */
  tabsPill?: ReactNode;
}) {
  const { cacheKey, tabsPill } = props;
  const details = useGitStore((s) => s.prDetails[cacheKey]);
  const [bodyExpanded, setBodyExpanded] = useState(true);

  const body = details?.body?.trim() ?? "";
  const hasBody = body.length > 0;

  if (!tabsPill && !hasBody) return null;

  return (
    <div className="flex flex-col gap-2 px-6 py-2">
      {tabsPill && <div className="flex justify-center">{tabsPill}</div>}
      {hasBody && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
          <button
            type="button"
            className="flex w-fit cursor-default items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-foreground"
            onClick={() => setBodyExpanded((v) => !v)}
          >
            {bodyExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <Trans>Description</Trans>
          </button>
          {bodyExpanded && (
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-surface-tertiary/30 px-4 py-3 text-xs">
              <ItemMarkdown text={body} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
