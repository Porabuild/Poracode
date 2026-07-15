import { startTransition } from "react";
import type { AgentSettingDef } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Select, ToggleSwitch } from "@/renderer/components/common";

export function AgentSettingRow(props: { agentKind: string; def: AgentSettingDef }) {
  const { agentKind, def } = props;
  const value = useSharedSettings((s) => s.agentSettings[agentKind]?.[def.key] ?? def.default);
  const setAgentSetting = useSharedSettings((s) => s.setAgentSetting);

  if (def.type !== "toggle" && def.type !== "select") return null;

  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/10 last:border-0 group">
      <div className="flex flex-col min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <p className="text-[11px] text-muted line-clamp-1 group-hover:line-clamp-none transition-all">
          {def.description}
        </p>
      </div>
      {def.type === "toggle" ? (
        <ToggleSwitch
          aria-label={def.label}
          isSelected={value as boolean}
          size="sm"
          onChange={(selected) => {
            startTransition(() => {
              setAgentSetting(agentKind, def.key, selected);
            });
          }}
        />
      ) : (
        <Select
          aria-label={def.label}
          className="w-[140px] shrink-0"
          options={def.options}
          value={String(value)}
          onChange={(v) => {
            startTransition(() => {
              setAgentSetting(agentKind, def.key, v);
            });
          }}
        />
      )}
    </div>
  );
}
