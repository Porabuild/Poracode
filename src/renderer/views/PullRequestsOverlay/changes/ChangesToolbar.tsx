import type { ReactNode } from "react";
import { Button, Tooltip } from "@heroui/react";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  MessageSquareOff,
  PanelLeftClose,
  PanelLeftOpen,
  Rows2,
  Space,
  WrapText,
} from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { PrCommitSummary } from "@/shared/contracts";
import { PrResponsiveMenu, type PrMenuItem } from "../parts/PrResponsiveMenu";

export const DIFF_MODE = { Split: 1, Unified: 4 } as const;
export const ALL_CHANGES = "all";

/** "All changes" plus one option per commit, for the scope picker in either toolbar. */
export function commitScopeOptions(
  commits: readonly PrCommitSummary[] | null,
  allLabel: string,
): { id: string; label: string; commit: PrCommitSummary | null }[] {
  return [
    { id: ALL_CHANGES, label: allLabel, commit: null },
    ...(commits ?? []).map((commit) => ({
      id: commit.oid,
      label: `${commit.abbreviatedOid} ${commit.messageHeadline}`,
      commit,
    })),
  ];
}

/** The icon explaining why line comments are unavailable. */
export function CommentsOffIndicator(props: { reason: string; className: string }) {
  return (
    <span role="img" aria-label={props.reason} className={props.className}>
      <MessageSquareOff className="size-4" />
    </span>
  );
}

function IconToggle(props: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { label, pressed, disabled = false, onPress, children } = props;
  return (
    <span className="inline-flex shrink-0">
      <Tooltip delay={0}>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={label}
          {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
          isDisabled={disabled}
          className={pressed ? "bg-default text-foreground" : "text-muted hover:text-foreground"}
          onPress={onPress}
        >
          {children}
        </Button>
        <Tooltip.Content placement="bottom">{label}</Tooltip.Content>
      </Tooltip>
    </span>
  );
}

export function ChangesToolbar(props: {
  treeOpen: boolean;
  onToggleTree: () => void;
  mode: number;
  onMode: (mode: number) => void;
  wrap: boolean;
  onWrap: (wrap: boolean) => void;
  hideWhitespace: boolean;
  onHideWhitespace: (hide: boolean) => void;
  /** Every card is collapsed, so the button offers to expand them. */
  allCollapsed: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  /** `null` hides the commit scope select (the host cannot serve commit diffs). */
  commits: readonly PrCommitSummary[] | null;
  commitScope: string | null;
  onCommitScope: (commit: string | null) => void;
  /** Explains why line comments are unavailable (shown while one commit is open). */
  commentsOffReason: string | null;
  /** The "Review changes" entry. */
  review: ReactNode;
}) {
  const { t } = useLingui();
  const selectedCommit = props.commits?.find((commit) => commit.oid === props.commitScope);
  const scopeLabel = selectedCommit
    ? `${selectedCommit.abbreviatedOid} ${selectedCommit.messageHeadline}`
    : t`All changes`;
  const scopeId = selectedCommit?.oid ?? ALL_CHANGES;
  const scopeItems: PrMenuItem[] = commitScopeOptions(props.commits, t`All changes`).map(
    (option) => ({
      id: option.id,
      label: option.label,
      ...(option.commit
        ? {
            labelContent: (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[11px]">
                  {option.commit.abbreviatedOid}
                </span>
                <span className="min-w-0 truncate">{option.commit.messageHeadline}</span>
              </span>
            ),
          }
        : {}),
      checked: scopeId === option.id,
      onSelect: () => props.onCommitScope(option.commit ? option.id : null),
    }),
  );
  return (
    <div
      role="toolbar"
      aria-label={t`Diff options`}
      className="flex shrink-0 flex-nowrap items-center gap-1 border-b border-border px-3 py-1.5"
    >
      <IconToggle
        label={props.treeOpen ? t`Hide file tree` : t`Show file tree`}
        onPress={props.onToggleTree}
      >
        {props.treeOpen ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <PanelLeftOpen className="size-4" />
        )}
      </IconToggle>
      {props.commits ? (
        <div className="min-w-24 max-w-64 flex-[0_1_16rem]">
          <PrResponsiveMenu
            label={t`Commit scope`}
            placement="bottom start"
            menuClassName="w-64 max-w-[calc(100vw-2rem)]"
            sections={[{ id: "commit-scope", items: scopeItems }]}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                aria-label={t`Commit scope`}
                className="min-w-0 max-w-64 justify-start gap-1.5 px-2 text-muted hover:text-foreground"
              >
                <span className="min-w-0 flex-1 truncate text-left">{scopeLabel}</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden />
              </Button>
            }
          />
        </div>
      ) : null}
      {props.commentsOffReason ? (
        <Tooltip delay={0}>
          <CommentsOffIndicator
            reason={props.commentsOffReason}
            className="inline-flex size-6 items-center justify-center text-muted"
          />
          <Tooltip.Content placement="bottom">{props.commentsOffReason}</Tooltip.Content>
        </Tooltip>
      ) : null}
      <div className="flex-1" />
      <IconToggle
        label={t`Split view`}
        pressed={props.mode === DIFF_MODE.Split}
        onPress={() => props.onMode(DIFF_MODE.Split)}
      >
        <Columns2 className="size-4" />
      </IconToggle>
      <IconToggle
        label={t`Unified view`}
        pressed={props.mode === DIFF_MODE.Unified}
        onPress={() => props.onMode(DIFF_MODE.Unified)}
      >
        <Rows2 className="size-4" />
      </IconToggle>
      <IconToggle
        label={t`Wrap lines`}
        pressed={props.wrap}
        onPress={() => props.onWrap(!props.wrap)}
      >
        <WrapText className="size-4" />
      </IconToggle>
      <IconToggle
        label={t`Hide whitespace changes`}
        pressed={props.hideWhitespace}
        onPress={() => props.onHideWhitespace(!props.hideWhitespace)}
      >
        <Space className="size-4" />
      </IconToggle>
      <IconToggle
        label={props.allCollapsed ? t`Expand all` : t`Collapse all`}
        onPress={props.allCollapsed ? props.onExpandAll : props.onCollapseAll}
      >
        {props.allCollapsed ? (
          <ChevronsUpDown className="size-4" />
        ) : (
          <ChevronsDownUp className="size-4" />
        )}
      </IconToggle>
      <span className="inline-flex shrink-0">{props.review}</span>
    </div>
  );
}
