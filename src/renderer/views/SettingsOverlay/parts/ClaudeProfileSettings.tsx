import { useState } from "react";
import { Button, toast } from "@heroui/react";
import { Check, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  claudeProfileKind,
  parseClaudeProfileInstanceConfig,
  type AgentInstanceConfig,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import { Input } from "@/renderer/components/common";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";

function slugifyProfileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "profile"
  );
}

function defaultConfigDir(name: string): string {
  return `~/.lightcode/claude-profiles/${slugifyProfileName(name)}`;
}

function uniqueProfileId(name: string, existing: Readonly<Record<string, unknown>>): string {
  const base = slugifyProfileName(name);
  let candidate = base;
  let index = 2;
  while (existing[candidate]) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function refreshClaudeProfile(kind?: string): void {
  window.setTimeout(() => {
    void readBridge()
      .refreshAgentStatuses(currentWslDistros(), kind ? { agentKinds: [kind] } : undefined)
      .catch((error) =>
        toast.danger(
          error instanceof Error ? error.message : i18n._(msg`Unable to refresh Claude profiles.`),
        ),
      );
  }, 50);
}

function ClaudeProfileRow(props: {
  instance: AgentInstanceConfig;
  configDir: string;
  onSave: (instance: AgentInstanceConfig) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(props.instance.displayName ?? props.instance.id);
  const [configDir, setConfigDir] = useState(props.configDir);
  const trimmedName = name.trim();
  const trimmedConfigDir = configDir.trim();
  const changed =
    trimmedName !== (props.instance.displayName ?? props.instance.id) ||
    trimmedConfigDir !== props.configDir;
  const canSave = trimmedName.length > 0 && trimmedConfigDir.length > 0 && changed;

  return (
    <div className="col-span-3 grid grid-cols-subgrid items-center border-b border-border/10 py-2 last:border-0">
      <Input
        aria-label={t`Claude profile name`}
        className="min-w-0"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        aria-label={t`Claude profile config directory`}
        className="min-w-0"
        value={configDir}
        onChange={(event) => setConfigDir(event.target.value)}
      />
      <div className="flex shrink-0 items-center gap-1 justify-self-end">
        <Button
          isIconOnly
          aria-label={t`Save Claude profile`}
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-7"
          isDisabled={!canSave}
          onPress={() => {
            props.onSave({
              ...props.instance,
              displayName: trimmedName,
              config: { configDir: trimmedConfigDir },
            });
          }}
        >
          <Save className="size-3.5" />
        </Button>
        <Button
          isIconOnly
          aria-label={t`Remove Claude profile`}
          size="sm"
          variant="ghost"
          className="h-7 w-7 min-w-7 text-danger"
          onPress={() => props.onRemove(props.instance.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ClaudeProfileSettings() {
  const { t } = useLingui();
  const agentInstances = useSharedSettings((s) => s.agentInstances ?? {});
  const setAgentInstance = useSharedSettings((s) => s.setAgentInstance);
  const removeAgentInstance = useSharedSettings((s) => s.removeAgentInstance);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newConfigDir, setNewConfigDir] = useState("");

  const profiles: Array<{ instance: AgentInstanceConfig; configDir: string }> = [];
  for (const instance of Object.values(agentInstances)) {
    if (instance.driver !== "claude") continue;
    try {
      const parsed = parseClaudeProfileInstanceConfig(instance.config);
      profiles.push({ instance, configDir: parsed.configDir });
    } catch {
      // Ignore malformed records here; the supervisor skips them too.
    }
  }
  profiles.sort((a, b) =>
    (a.instance.displayName ?? a.instance.id).localeCompare(
      b.instance.displayName ?? b.instance.id,
    ),
  );

  const canAdd = newName.trim().length > 0;
  // Live default shown as the dir placeholder; used verbatim when left empty.
  const suggestedConfigDir = defaultConfigDir(newName);

  function closeAddForm(): void {
    setIsAdding(false);
    setNewName("");
    setNewConfigDir("");
  }

  function addProfile(): void {
    const displayName = newName.trim();
    const configDir = newConfigDir.trim() || suggestedConfigDir;
    if (!displayName) return;
    const id = uniqueProfileId(displayName, agentInstances);
    const instance: AgentInstanceConfig = {
      id,
      driver: "claude",
      displayName,
      config: { configDir },
    };
    setAgentInstance(instance);
    refreshClaudeProfile(claudeProfileKind(id));
    closeAddForm();
    toast.success(t`Claude ${displayName} profile added.`);
  }

  return (
    <div className="border-t border-border/10 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            <Trans>Profiles</Trans>
          </p>
          <p className="text-xs text-muted">
            <Trans>Separate Claude Code accounts by config directory.</Trans>
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => refreshClaudeProfile()}
        >
          <RefreshCw className="size-3" />
          <Trans>Refresh</Trans>
        </Button>
      </div>

      {profiles.length === 0 && !isAdding ? (
        <p className="py-2 text-xs text-muted">
          <Trans>No additional Claude profiles.</Trans>
        </p>
      ) : null}

      {/* One grid for saved rows AND the draft row (subgrid rows), so the
          action column — and therefore the input columns — stay aligned. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-x-2">
        {profiles.map(({ instance, configDir }) => (
          <ClaudeProfileRow
            key={instance.id}
            instance={instance}
            configDir={configDir}
            onSave={(next) => {
              setAgentInstance(next);
              refreshClaudeProfile(claudeProfileKind(next.id));
              toast.success(t`Claude ${next.displayName ?? next.id} profile saved.`);
            }}
            onRemove={(id) => {
              removeAgentInstance(id);
              refreshClaudeProfile();
              toast.success(t`Claude profile removed.`);
            }}
          />
        ))}

        {isAdding ? (
          <div className="col-span-3 grid grid-cols-subgrid items-center py-2">
            <Input
              // Focus the name field when the form is revealed by the explicit
              // "Add profile" press (the accepted exception to no-autofocus).
              ref={(node: HTMLInputElement | null) => node?.focus()}
              aria-label={t`New Claude profile name`}
              className="min-w-0"
              placeholder={t`e.g. Work`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Input
              aria-label={t`New Claude profile config directory`}
              className="min-w-0"
              placeholder={suggestedConfigDir}
              value={newConfigDir}
              onChange={(event) => setNewConfigDir(event.target.value)}
            />
            {/* Icon-only actions matching the saved rows' save/delete pair, so
                the action column keeps the same width when the draft opens. */}
            <div className="flex shrink-0 items-center gap-1 justify-self-end">
              <Button
                isIconOnly
                aria-label={t`Add Claude profile`}
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7"
                isDisabled={!canAdd}
                onPress={addProfile}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                isIconOnly
                aria-label={t`Cancel new Claude profile`}
                size="sm"
                variant="ghost"
                className="h-7 w-7 min-w-7"
                onPress={closeAddForm}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {!isAdding ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-7 min-h-7 gap-1 px-2 text-[11px]"
          onPress={() => setIsAdding(true)}
        >
          <Plus className="size-3" />
          <Trans>Add profile</Trans>
        </Button>
      ) : null}
    </div>
  );
}
