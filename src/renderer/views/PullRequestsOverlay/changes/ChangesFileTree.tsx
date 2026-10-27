import { useState } from "react";
import { Checkbox } from "@heroui/react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { DiffStat } from "@/renderer/components/common/DiffStat";
import { FileIcon } from "@/renderer/components/common/FileIcon";
import { usePrFlow } from "../detail/prFlow";
import type { PrViewedState } from "../viewed/prViewedFiles";
import type { ChangeEntry } from "./changesModel";
import { buildFileTree, type TreeNode } from "./fileTree";
import { FileKindIcon } from "./FileKindIcon";

interface TreeContext {
  byPath: ReadonlyMap<string, ChangeEntry>;
  viewStates: ReadonlyMap<string, PrViewedState> | null;
  activePath: string | null;
  viewedDisabled: boolean;
  closedDirs: ReadonlySet<string>;
  /** Touch sizing: taller rows and a roomier viewed checkbox. */
  touch: boolean;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
  onToggleViewed: (path: string) => void;
}

const INDENT_PX = 12;

function FileRow(props: {
  node: Extract<TreeNode, { kind: "file" }>;
  depth: number;
  ctx: TreeContext;
}) {
  const { node, depth, ctx } = props;
  const { t } = useLingui();
  const entry = ctx.byPath.get(node.path);
  const viewState = ctx.viewStates?.get(node.path) ?? "unread";
  const active = ctx.activePath === node.path;
  if (!entry) return null;
  return (
    <div
      className={`flex w-full items-center gap-1 rounded pr-1 ${ctx.touch ? "min-h-10" : ""} ${
        active ? "bg-[var(--row-active)]" : "hover:bg-[var(--row-hover)]"
      }`}
      style={{ paddingLeft: depth * INDENT_PX }}
    >
      {ctx.viewStates ? (
        <Checkbox
          aria-label={viewState === "viewed" ? t`Mark as not viewed` : t`Mark as viewed`}
          className={ctx.touch ? "shrink-0 p-2" : "shrink-0"}
          isSelected={viewState === "viewed"}
          isDisabled={ctx.viewedDisabled}
          onChange={() => ctx.onToggleViewed(node.path)}
        >
          <Checkbox.Content>
            <Checkbox.Control className={ctx.touch ? "size-7 rounded-lg" : ""}>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
      ) : null}
      <button
        type="button"
        title={node.path}
        aria-current={active ? "true" : undefined}
        className={`flex min-w-0 flex-1 cursor-default items-center gap-1.5 rounded text-left text-xs transition-colors ${ctx.touch ? "self-stretch py-2" : "py-1"} ${
          active ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
        onClick={() => ctx.onSelect(node.path)}
      >
        <FileIcon path={node.path} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {viewState === "changed" ? (
          <span className="shrink-0 text-[10px] font-medium text-warning">{t`Changed`}</span>
        ) : null}
        <FileKindIcon kind={entry.kind} />
        <span className="flex w-14 shrink-0 items-center justify-end text-[10px] leading-4 font-medium">
          <DiffStat
            className="flex items-center gap-0.5"
            insertions={entry.file.additions}
            deletions={entry.file.deletions}
          />
        </span>
      </button>
    </div>
  );
}

function Rows(props: { nodes: readonly TreeNode[]; depth: number; ctx: TreeContext }) {
  const { nodes, depth, ctx } = props;
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          return <FileRow key={node.path} node={node} depth={depth} ctx={ctx} />;
        }
        const closed = ctx.closedDirs.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              aria-expanded={!closed}
              title={node.path}
              className={`flex w-full cursor-default items-center gap-1 rounded pr-1 text-left text-xs text-muted hover:bg-[var(--row-hover)] hover:text-foreground ${
                ctx.touch ? "min-h-10 py-2" : "py-1"
              }`}
              style={{ paddingLeft: depth * INDENT_PX }}
              onClick={() => ctx.onToggleDir(node.path)}
            >
              {closed ? (
                <ChevronRight className="size-3 shrink-0" />
              ) : (
                <ChevronDown className="size-3 shrink-0" />
              )}
              <Folder className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{node.name}</span>
            </button>
            {closed ? null : <Rows nodes={node.children} depth={depth + 1} ctx={ctx} />}
          </div>
        );
      })}
    </>
  );
}

/**
 * Folder tree of the changed files. With `viewStates`, files marked viewed move
 * to a collapsed group at the bottom, as in the old sidebar.
 */
export function ChangesFileTree(props: {
  entries: readonly ChangeEntry[];
  /** `null` hides viewed marks (a single commit has none). */
  viewStates: ReadonlyMap<string, PrViewedState> | null;
  activePath: string | null;
  viewedDisabled: boolean;
  viewedLabel: string;
  loading: boolean;
  onSelect: (path: string) => void;
  onToggleViewed: (path: string) => void;
}) {
  const { entries, viewStates, loading } = props;
  const { t } = useLingui();
  const { flow } = usePrFlow();
  const [closedDirs, setClosedDirs] = useState<ReadonlySet<string>>(new Set());
  const [viewedOpen, setViewedOpen] = useState(false);
  const byPath = new Map(entries.map((entry) => [entry.file.path, entry]));
  const isViewed = (path: string) => viewStates?.get(path) === "viewed";
  const pending = entries.filter((entry) => !isViewed(entry.file.path));
  const viewed = entries.filter((entry) => isViewed(entry.file.path));
  const ctx: TreeContext = {
    byPath,
    viewStates,
    activePath: props.activePath,
    viewedDisabled: props.viewedDisabled,
    closedDirs,
    touch: flow,
    onToggleDir: (path) =>
      setClosedDirs((current) => {
        const next = new Set(current);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    onSelect: props.onSelect,
    onToggleViewed: props.onToggleViewed,
  };
  const totalCount = entries.length;
  const viewedCount = viewed.length;

  return (
    <nav
      aria-label={t`Changed files`}
      className={flow ? "flex flex-col" : "flex min-h-0 flex-1 flex-col"}
    >
      {viewStates ? (
        <div className="shrink-0 px-2 py-1 text-[10px] font-medium text-muted">
          {t`${viewedCount} of ${totalCount} viewed`}
        </div>
      ) : null}
      <div
        className={
          flow ? "space-y-px px-1 pb-2" : "min-h-0 flex-1 space-y-px overflow-y-auto px-1 pb-2"
        }
      >
        {loading && totalCount === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted/60">
            <Trans>Loading PR…</Trans>
          </div>
        ) : null}
        {!loading && totalCount === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted/60">
            <Trans>No changes</Trans>
          </div>
        ) : null}
        <Rows nodes={buildFileTree(pending.map((entry) => entry.file.path))} depth={0} ctx={ctx} />
        {viewed.length > 0 ? (
          <div className="pt-1">
            <button
              type="button"
              aria-expanded={viewedOpen}
              className={`flex w-full cursor-default items-center gap-1 px-1 py-1 text-[11px] font-medium text-muted ${
                flow ? "min-h-10" : ""
              }`}
              onClick={() => setViewedOpen((open) => !open)}
            >
              {viewedOpen ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {props.viewedLabel}
              <span className="font-normal text-muted/60">({viewed.length})</span>
            </button>
            {viewedOpen ? (
              <Rows
                nodes={buildFileTree(viewed.map((entry) => entry.file.path))}
                depth={0}
                ctx={ctx}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
