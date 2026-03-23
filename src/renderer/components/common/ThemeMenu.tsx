import { Dropdown, Label } from "@heroui/react";
import { Check, ChevronDown, Monitor, Moon, Settings2, Sun } from "lucide-react";
import type { ThemeMode } from "../../../shared/contracts";
import { Button } from "./Button";

const themeOptions: {
  id: ThemeMode;
  label: string;
  icon: typeof Monitor;
}[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

export function ThemeMenu(props: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const { value, onChange } = props;
  const activeTheme = themeOptions.find((option) => option.id === value) ?? themeOptions[0]!;
  const ActiveThemeIcon = activeTheme.icon;

  return (
    <Dropdown>
      <Button
        aria-label="Theme settings"
        className="w-full justify-between rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-2.5 text-sm text-foreground hover:bg-white/[0.05]"
        variant="ghost"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted" />
          <span>Settings</span>
        </span>
        <span className="flex items-center gap-2 text-muted">
          <ActiveThemeIcon className="size-4" />
          <span>{activeTheme.label}</span>
          <ChevronDown className="size-3.5" />
        </span>
      </Button>
      <Dropdown.Popover className="min-w-[220px] rounded-2xl border border-border bg-overlay/95 p-1 shadow-xl">
        <Dropdown.Menu
          aria-label="Theme mode"
          className="rounded-xl"
          onAction={(key) => onChange(String(key) as ThemeMode)}
        >
          {themeOptions.map((option) => {
            const Icon = option.icon;

            return (
              <Dropdown.Item key={option.id} id={option.id} textValue={option.label}>
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted" />
                    <Label>{option.label}</Label>
                  </span>
                  {option.id === value ? <Check className="size-3.5 text-accent" /> : null}
                </div>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
