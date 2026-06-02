import { Popover } from "@heroui/react";
import { Button } from "@/renderer/components/common";
import { ACTION_ICONS } from "@/renderer/utils/actionIcons";

export function ActionIconPicker(props: { value: string; onChange: (name: string) => void }) {
  const { value, onChange } = props;
  const selected = ACTION_ICONS.find((i) => i.name === value) ?? ACTION_ICONS[0]!;

  return (
    <Popover>
      <Button
        isIconOnly
        variant="ghost"
        aria-label="Pick icon"
        className="size-8 min-w-0 shrink-0 border border-[var(--hairline-strong)] bg-[var(--row-hover)] text-muted hover:border-[var(--hairline-strong)] hover:text-foreground"
      >
        <selected.Icon className="size-4" />
      </Button>
      <Popover.Content placement="bottom start" className="w-auto p-0">
        <Popover.Dialog className="p-2">
          <div className="grid grid-cols-6 gap-1">
            {ACTION_ICONS.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                  entry.name === value
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:bg-[var(--row-active)] hover:text-foreground"
                }`}
                aria-label={entry.name}
                onClick={() => onChange(entry.name)}
              >
                <entry.Icon className="size-4" />
              </button>
            ))}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
