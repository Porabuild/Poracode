import { ChevronDown, ChevronRight } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { handleKeyActivate } from "@/renderer/utils/a11y";
import type { DiffEntry } from "./diffHelpers";

export function FileHeader(props: {
  entry: DiffEntry;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { entry, collapsed, onToggleCollapse } = props;
  return (
    <div
      role="button"
      tabIndex={0}
      className="sticky top-0 z-10 flex cursor-pointer select-none items-center gap-2 border-b border-border bg-[var(--content-background)] px-3 py-1.5 text-xs"
      onClick={onToggleCollapse}
      onKeyDown={(e) => handleKeyActivate(e, onToggleCollapse)}
    >
      {collapsed ? (
        <ChevronRight className="size-3 shrink-0 text-muted" />
      ) : (
        <ChevronDown className="size-3 shrink-0 text-muted" />
      )}
      <span className={entry.staged ? "text-success" : "text-warning"}>
        {entry.staged ? <Trans>staged</Trans> : <Trans>unstaged</Trans>}
      </span>
      <span className="min-w-0 truncate font-medium text-foreground">{entry.filePath}</span>
      <span className="ml-auto flex shrink-0 gap-2">
        {entry.insertions > 0 && <span className="text-success">+{entry.insertions}</span>}
        {entry.deletions > 0 && <span className="text-danger">-{entry.deletions}</span>}
      </span>
    </div>
  );
}
