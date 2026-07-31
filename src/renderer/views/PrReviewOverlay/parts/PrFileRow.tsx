import type { PrFile } from "@/shared/contracts";
import { DiffStat, FileIcon, PathDisplay } from "@/renderer/components/common";

export function PrFileRow(props: { file: PrFile; isSelected: boolean; onSelect: () => void }) {
  const { file, isSelected, onSelect } = props;

  return (
    <button
      type="button"
      className={`flex w-full cursor-default items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
        isSelected
          ? "bg-[var(--row-active)] text-foreground"
          : "text-muted hover:bg-[var(--row-hover)] hover:text-foreground"
      }`}
      onClick={onSelect}
    >
      <FileIcon path={file.path} />
      <PathDisplay path={file.path} className="flex-1" />
      {/* Keep the fixed-width column even for a 0/0 file so rows stay aligned. */}
      <span className="flex w-14 shrink-0 items-center justify-end text-[10px] leading-4 font-medium">
        <DiffStat
          className="flex items-center gap-0.5"
          insertions={file.additions}
          deletions={file.deletions}
        />
      </span>
    </button>
  );
}
