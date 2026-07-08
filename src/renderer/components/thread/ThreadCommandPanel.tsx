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
}

export function ThreadCommandPanel(props: ThreadCommandPanelProps) {
  const { commands, activeIndex, onSelect } = props;
  const { t } = useLingui();
  const activeRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof activeRowRef.current?.scrollIntoView === "function") {
      activeRowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (commands.length === 0) return null;

  return (
    <ThreadDockSection placement="composer" collapsed={false}>
      <ThreadDockHeader icon={Terminal} title={t`Commands`} countLabel={String(commands.length)} />

      <div className="px-1 pb-1">
        <div
          className="max-h-[min(12rem,32vh)] space-y-0 overflow-y-auto [scrollbar-gutter:stable]"
          role="listbox"
        >
          {commands.map((cmd, index) => {
            const isActive = index === activeIndex;
            return (
              <div key={cmd.id} onMouseEnter={() => props.onActiveIndexChange(index)}>
                <button
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
                  {cmd.description && (
                    <span className="min-w-0 flex-1 truncate font-normal text-[color:var(--muted)]">
                      {cmd.description}
                    </span>
                  )}
                  {cmd.argumentHint && (
                    <span className="shrink-0 text-muted/60">{cmd.argumentHint}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ThreadDockSection>
  );
}
