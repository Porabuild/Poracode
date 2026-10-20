import { Checkbox } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { PrFile } from "@/shared/contracts";
import { DiffStat, FileIcon, PathDisplay } from "@/renderer/components/common";
import type { PrViewedState } from "./prViewedFiles";

export function PrFileRow(props: {
  file: PrFile;
  isSelected: boolean;
  viewState: PrViewedState;
  viewedLoading: boolean;
  onSelect: () => void;
  onMarkViewed: () => void;
  onClearViewed: () => void;
}) {
  const { file, isSelected, viewState, viewedLoading, onSelect, onMarkViewed, onClearViewed } =
    props;
  const { t } = useLingui();

  return (
    <div
      className={`flex w-full items-center gap-1 rounded pr-1 ${
        isSelected ? "bg-[var(--row-active)]" : "hover:bg-[var(--row-hover)]"
      }`}
    >
      <Checkbox
        aria-label={viewState === "viewed" ? t`Mark as not viewed` : t`Mark as viewed`}
        className="shrink-0"
        isSelected={viewState === "viewed"}
        isDisabled={viewedLoading}
        onChange={(selected) => {
          if (selected) onMarkViewed();
          else onClearViewed();
        }}
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Content>
      </Checkbox>
      <button
        type="button"
        className={`flex min-w-0 flex-1 cursor-default items-center gap-1.5 rounded py-1 text-left text-xs transition-colors ${
          isSelected ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
        onClick={onSelect}
      >
        <FileIcon path={file.path} />
        <PathDisplay path={file.path} className="flex-1" />
        {viewState === "changed" ? (
          <span className="shrink-0 text-[10px] font-medium text-warning">{t`Changed`}</span>
        ) : null}
        {/* Keep the fixed-width column even for a 0/0 file so rows stay aligned. */}
        <span className="flex w-14 shrink-0 items-center justify-end text-[10px] leading-4 font-medium">
          <DiffStat
            className="flex items-center gap-0.5"
            insertions={file.additions}
            deletions={file.deletions}
          />
        </span>
      </button>
    </div>
  );
}
