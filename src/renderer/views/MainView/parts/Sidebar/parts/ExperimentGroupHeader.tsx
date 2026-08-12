import { Tooltip } from "@heroui/react";
import { Check, Columns2, FlaskConical, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { InlineRenameInput } from "./InlineRenameInput";

export function ExperimentGroupHeader(props: {
  title: string;
  isCollapsed: boolean;
  isDone?: boolean;
  updatedAt: string;
  canOpenAll: boolean;
  isRenaming: boolean;
  onRenameCommit: (value: string) => void;
  onRenameCancel: () => void;
  onToggleCollapse: () => void;
  onOpenBoard: () => void;
  onOpenAll: () => void;
  onDiscard: () => void;
  projectSyncBadge?: React.ReactNode;
}) {
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";
  const actionButtonClass = `flex h-[18px] shrink-0 items-center justify-center rounded text-muted/60 transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground ${hiddenPanelButtonClass}`;

  return (
    <SidebarButton
      icon={
        props.isDone ? (
          <span className="relative size-3.5 shrink-0 text-muted">
            <FlaskConical className="size-3.5 opacity-40" />
            <Check
              className="absolute left-[15%] top-[15%] size-[70%] text-success"
              strokeWidth={4}
            />
          </span>
        ) : (
          <FlaskConical
            className={`size-3.5 shrink-0 transition-colors ${
              props.isCollapsed ? "text-muted/60" : "text-foreground"
            }`}
          />
        )
      }
      label={
        props.isRenaming ? (
          <InlineRenameInput
            ariaLabel={t`Rename experiment`}
            initialValue={props.title}
            onCommit={props.onRenameCommit}
            onCancel={props.onRenameCancel}
          />
        ) : (
          <span
            className={`font-medium ${props.isDone ? "opacity-50 line-through" : "text-foreground/80"}`}
          >
            {props.title}
          </span>
        )
      }
      {...(props.isRenaming ? {} : { tooltip: props.title })}
      size="xs"
      liveText
      className={compactLayout ? "poracode-sidebar-touch-row" : "h-8"}
      {...(props.isRenaming ? {} : { onPress: props.onToggleCollapse })}
      suffix={
        props.isRenaming ? undefined : (
          <>
            {compactLayout ? null : props.projectSyncBadge}
            {compactLayout ? null : (
              <>
                <Tooltip delay={300}>
                  <Tooltip.Trigger>
                    <button
                      type="button"
                      aria-label={t`Open experiment board`}
                      className={actionButtonClass}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onOpenBoard();
                      }}
                    >
                      <SquareArrowOutUpRight className="size-3" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>{t`Open experiment board`}</Tooltip.Content>
                </Tooltip>
                {props.canOpenAll ? (
                  <Tooltip delay={300}>
                    <Tooltip.Trigger>
                      <button
                        type="button"
                        aria-label={t`Open All`}
                        className={actionButtonClass}
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onOpenAll();
                        }}
                      >
                        <Columns2 className="size-3" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t`Open All`}</Tooltip.Content>
                  </Tooltip>
                ) : null}
                <span className="relative w-[2.4ch] shrink-0">
                  <RelativeTime
                    iso={props.updatedAt}
                    className="block text-center font-mono text-[10px] tabular-nums text-muted group-hover:invisible"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={t`Discard ${props.title}`}
                    className="absolute inset-0 flex items-center justify-center rounded text-muted/55 opacity-0 transition hover:text-danger group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onDiscard();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        props.onDiscard();
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </div>
                </span>
              </>
            )}
            {compactLayout ? (
              <RelativeTime
                iso={props.updatedAt}
                className="block text-center font-mono text-[10px] tabular-nums text-muted"
              />
            ) : null}
          </>
        )
      }
    />
  );
}
