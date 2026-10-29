import { Button } from "@heroui/react";
import { SlidersHorizontal } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PrCommitSummary } from "@/shared/contracts";
import { Select, type SelectOption } from "@/renderer/components/common/Select";
import { PrResponsiveMenu, type PrMenuSection } from "../parts/PrResponsiveMenu";
import { ALL_CHANGES, CommentsOffIndicator, commitScopeOptions, DIFF_MODE } from "./ChangesToolbar";

type OptionKey = "split" | "unified" | "wrap" | "whitespace" | "collapse";

/**
 * The compact diff toolbar: one row with a single "view options" menu (layout, wrap,
 * whitespace, collapse or expand all) and the commit scope select, instead of a
 * row of separate icon buttons.
 */
export function ChangesToolbarCompact(props: {
  mode: number;
  onMode: (mode: number) => void;
  wrap: boolean;
  onWrap: (wrap: boolean) => void;
  hideWhitespace: boolean;
  onHideWhitespace: (hide: boolean) => void;
  allCollapsed: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  commits: readonly PrCommitSummary[] | null;
  commitScope: string | null;
  onCommitScope: (commit: string | null) => void;
  commentsOffReason: string | null;
}) {
  const { t } = useLingui();
  const options: SelectOption[] = commitScopeOptions(props.commits, t`All changes`);
  const items: { id: OptionKey; label: string; checked: boolean }[] = [
    { id: "split", label: t`Split view`, checked: props.mode === DIFF_MODE.Split },
    { id: "unified", label: t`Unified view`, checked: props.mode === DIFF_MODE.Unified },
    { id: "wrap", label: t`Wrap lines`, checked: props.wrap },
    { id: "whitespace", label: t`Hide whitespace changes`, checked: props.hideWhitespace },
    {
      id: "collapse",
      label: props.allCollapsed ? t`Expand all` : t`Collapse all`,
      checked: false,
    },
  ];
  const sections: PrMenuSection[] = [
    {
      id: "view",
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        checked: item.checked,
        keepOpen: item.id === "wrap" || item.id === "whitespace",
        onSelect: () => run(item.id),
      })),
    },
  ];
  function run(key: OptionKey) {
    if (key === "split") props.onMode(DIFF_MODE.Split);
    else if (key === "unified") props.onMode(DIFF_MODE.Unified);
    else if (key === "wrap") props.onWrap(!props.wrap);
    else if (key === "whitespace") props.onHideWhitespace(!props.hideWhitespace);
    else if (props.allCollapsed) props.onExpandAll();
    else props.onCollapseAll();
  }
  return (
    <div
      role="toolbar"
      aria-label={t`Diff options`}
      className="flex items-center gap-1 px-[var(--m-page-inline)] pb-1"
    >
      <PrResponsiveMenu
        label={t`View options`}
        placement="bottom start"
        sections={sections}
        trigger={
          <Button isIconOnly size="sm" variant="ghost" aria-label={t`View options`}>
            <SlidersHorizontal className="size-4" />
          </Button>
        }
      />
      {props.commits ? (
        <div className="min-w-0 flex-1">
          <Select
            aria-label={t`Commit scope`}
            options={options}
            value={props.commitScope ?? ALL_CHANGES}
            onChange={(id) => props.onCommitScope(id === ALL_CHANGES ? null : id)}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {props.commentsOffReason ? (
        <CommentsOffIndicator
          reason={props.commentsOffReason}
          className="inline-flex size-9 shrink-0 items-center justify-center text-muted"
        />
      ) : null}
    </div>
  );
}
