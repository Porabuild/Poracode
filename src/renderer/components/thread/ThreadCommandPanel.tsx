import { useEffect, useRef } from "react";
import { Sparkles, Terminal } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { AgentSlashCommand } from "@/shared/contracts";
import { slashCommandDisplayId } from "./threadSlashCommands";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

interface ThreadCommandPanelProps {
  commands: AgentSlashCommand[];
  activeIndex: number;
  onSelect: (command: AgentSlashCommand) => void;
  onActiveIndexChange: (index: number) => void;
  listId: string;
  appearance?: "dock" | "popover";
  maxHeight?: number;
}

export function ThreadCommandPanel(props: ThreadCommandPanelProps) {
  const { commands, activeIndex, onSelect } = props;
  const { t } = useLingui();
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const groups = commands.reduce<
    Array<{
      section: AgentSlashCommand["section"];
      items: Array<{ command: AgentSlashCommand; index: number }>;
    }>
  >((result, command, index) => {
    const current = result.at(-1);
    if (current && current.section === command.section) current.items.push({ command, index });
    else result.push({ section: command.section, items: [{ command, index }] });
    return result;
  }, []);

  useEffect(() => {
    if (typeof activeRowRef.current?.scrollIntoView === "function") {
      activeRowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (commands.length === 0) return null;

  const isPopover = props.appearance === "popover";
  const list = (
    <div
      id={props.listId}
      aria-label={t`Slash commands`}
      className={
        isPopover
          ? "poracode-mention-popover__list"
          : "max-h-[min(12rem,32vh)] space-y-0 overflow-y-auto [scrollbar-gutter:stable]"
      }
      role="listbox"
      {...(isPopover && props.maxHeight ? { style: { maxHeight: props.maxHeight } } : {})}
    >
      {groups.map((group, groupIndex) => {
        const groupLabel = group.section === "skills" ? t`Skills` : t`Commands`;
        const headingId = `${props.listId}-group-${groupIndex}`;
        return (
          <div
            key={headingId}
            role="group"
            aria-labelledby={headingId}
            className={isPopover ? "poracode-mention-popover__section" : undefined}
          >
            <div
              id={headingId}
              className={
                isPopover
                  ? "poracode-mention-popover__section-label"
                  : "px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase text-muted/70"
              }
            >
              {groupLabel}
            </div>
            {group.items.map(({ command: cmd, index }) => {
              const isActive = index === activeIndex;
              const displayId = slashCommandDisplayId(cmd);
              const skill = displayId;
              const key = cmd.section === "skills" ? `skill:${cmd.skillPath ?? cmd.id}` : cmd.id;
              return (
                <div key={key} onMouseEnter={() => props.onActiveIndexChange(index)}>
                  <button
                    id={`${props.listId}-option-${index}`}
                    ref={isActive ? activeRowRef : undefined}
                    aria-selected={isActive}
                    className={
                      isPopover
                        ? `poracode-mention-popover__item w-full border-0 bg-transparent text-left ${isActive ? "poracode-mention-popover__item--active" : ""}`
                        : `flex w-full cursor-pointer items-center gap-3 rounded px-2 py-1 text-left leading-5 transition-colors hover:bg-foreground/5 ${isActive ? "bg-accent/10" : ""}`
                    }
                    role="option"
                    tabIndex={-1}
                    type="button"
                    {...(cmd.section === "skills" ? { "aria-label": t`Skill: ${skill}` } : {})}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (isPopover) onSelect(cmd);
                    }}
                    {...(!isPopover ? { onClick: () => onSelect(cmd) } : {})}
                  >
                    <span
                      className={
                        isPopover
                          ? "poracode-mention-popover__label shrink-0 gap-1 font-bold"
                          : "flex shrink-0 items-center gap-1 font-bold text-foreground"
                      }
                    >
                      {cmd.section === "skills" ? (
                        <Sparkles aria-hidden="true" className="size-3" />
                      ) : (
                        "/"
                      )}
                      {displayId}
                    </span>
                    {cmd.description && (
                      <span className="poracode-mention-popover__detail min-w-0 flex-1 truncate font-normal text-[color:var(--muted)]">
                        {cmd.description}
                      </span>
                    )}
                    {cmd.section === "skills" && cmd.skillProvider ? (
                      <span className="poracode-mention-popover__detail ml-auto shrink-0 text-xs text-muted/60">
                        {cmd.skillProvider} ·{" "}
                        {cmd.skillScope === "project" ? t`Project` : t`Global`}
                      </span>
                    ) : cmd.argumentHint ? (
                      <span className="poracode-mention-popover__detail ml-auto shrink-0 text-xs text-muted/60">
                        {cmd.argumentHint}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  if (isPopover) {
    return (
      <div
        className="poracode-mention-popover"
        style={{ width: "100%", maxHeight: props.maxHeight }}
      >
        {list}
      </div>
    );
  }

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Terminal}
        title={t`Slash commands`}
        countLabel={String(commands.length)}
      />
      <div className="px-1 pb-1">{list}</div>
    </ThreadDockSection>
  );
}
