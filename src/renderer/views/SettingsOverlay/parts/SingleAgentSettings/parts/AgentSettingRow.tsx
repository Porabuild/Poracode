import { startTransition } from "react";
import { toast } from "@heroui/react";
import type { AgentSettingDef } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { Select, ToggleSwitch } from "@/renderer/components/common";
import {
  useAgentSettingsHost,
  useHostAgentSettingValues,
  useHostSettingsReady,
} from "@/renderer/components/providers/settings/AgentSettingsHostContext";

export function AgentSettingRow(props: { agentKind: string; def: AgentSettingDef }) {
  const { agentKind, def } = props;
  const settingsHost = useAgentSettingsHost();
  const values = useHostAgentSettingValues(agentKind);
  const ready = useHostSettingsReady();
  const value = values?.[def.key] ?? def.default;

  if (def.type !== "toggle" && def.type !== "select") return null;

  const commit = (next: boolean | string) => {
    startTransition(() => {
      const pending = settingsHost.setAgentSetting(agentKind, def.key, next);
      if (pending) {
        void pending.catch((error) => toast.danger(friendlyError(error)));
      }
    });
  };

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
          isDisabled={!ready}
          size="sm"
          onChange={commit}
        />
      ) : (
        <Select
          aria-label={def.label}
          className="w-[140px] shrink-0"
          options={def.options}
          value={String(value)}
          isDisabled={!ready}
          onChange={commit}
        />
      )}
    </div>
  );
}
