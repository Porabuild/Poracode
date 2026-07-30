import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { AgentSlashCommand } from "@/shared/contracts";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

interface ThreadCommandPanelProps {
  commands: AgentSlashCommand[];
  activeIndex: number;
  onSelect: (command: AgentSlashCommand) => void;
  onActiveIndexChange: (index: number) => void;
  listId: string;
}

function commandDisplayName(command: AgentSlashCommand): string {
  if (command.section !== "skills") return command.id;
  const descriptionSuffix = command.description ? ` — ${command.description}` : "";
  return descriptionSuffix && command.label.endsWith(descriptionSuffix)
    ? command.label.slice(0, -descriptionSuffix.length)
    : command.label;
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

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader
        icon={Terminal}
        title={t`Slash commands`}
        countLabel={String(commands.length)}
      />

      <div className="px-1 pb-1">
        <div
          id={props.listId}
          aria-label={t`Slash commands`}
          className="max-h-[min(12rem,32vh)] space-y-0 overflow-y-auto [scrollbar-gutter:stable]"
          role="listbox"
        >
          {groups.map((group, groupIndex) => {
            const groupLabel = group.section === "skills" ? t`Skills` : t`Commands`;
            const headingId = `${props.listId}-group-${groupIndex}`;
            return (
              <div key={headingId} role="group" aria-labelledby={headingId}>
                <div
                  id={headingId}
                  className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase text-muted/70"
                >
                  {groupLabel}
                </div>
                {group.items.map(({ command: cmd, index }) => {
                  const isActive = index === activeIndex;
                  const key =
                    cmd.section === "skills" ? `skill:${cmd.skillPath ?? cmd.id}` : cmd.id;
                  const displayName = commandDisplayName(cmd);
                  return (
                    <div key={key} onMouseEnter={() => props.onActiveIndexChange(index)}>
                      <button
                        id={`${props.listId}-option-${index}`}
                        ref={isActive ? activeRowRef : undefined}
                        aria-selected={isActive}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded px-2 py-1 text-left leading-5 transition-colors hover:bg-foreground/5 ${
                          isActive ? "bg-accent/10" : ""
                        }`}
                        role="option"
                        tabIndex={-1}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onSelect(cmd)}
                      >
                        <span className="shrink-0 font-bold text-foreground">/{cmd.id}</span>
                        {cmd.section === "skills" && displayName !== cmd.id ? (
                          <span className="min-w-0 max-w-40 truncate font-medium text-foreground/80">
                            {displayName}
                          </span>
                        ) : null}
                        {cmd.description && (
                          <span className="min-w-0 flex-1 truncate font-normal text-[color:var(--muted)]">
                            {cmd.description}
                          </span>
                        )}
                        {cmd.section === "skills" && cmd.skillProvider ? (
                          <span className="shrink-0 text-xs text-muted/60">
                            {cmd.skillProvider} ·{" "}
                            {cmd.skillScope === "project" ? t`Project` : t`Global`}
                          </span>
                        ) : cmd.argumentHint ? (
                          <span className="shrink-0 text-muted/60">{cmd.argumentHint}</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </ThreadDockSection>
  );
}
