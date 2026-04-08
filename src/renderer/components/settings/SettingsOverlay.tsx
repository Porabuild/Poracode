import {
  Button,
  Dropdown,
  Label,
  Surface,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@heroui/react";
import type { Selection } from "@heroui/react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  GitBranch,
  Monitor,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { startTransition, useState } from "react";
import type {
  AgentSettingDef,
  AgentStatus,
  TerminalPosition,
  ThemeMode,
  ThreadRemoveAction,
} from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import {
  getCommitGenDefaultsHint,
  getConflictResolverDefaultsHint,
  getTitleGenDefaultsHint,
  resolveCommitGenConfig,
  resolveTitleGenConfig,
  resolveConflictResolverConfig,
} from "../providers";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Select, SidebarButton, TuxIcon } from "../common";
import { useSidebar } from "../layout/AppShell";
import { PageLayout } from "../layout/PageLayout";

const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

const terminalPositionOptions = [
  { id: "right", label: "Right" },
  { id: "bottom", label: "Bottom" },
] as const;

const staleThreadUnloadOptions = [
  { id: "0", label: "Disabled" },
  { id: "10", label: "10 minutes" },
  { id: "20", label: "20 minutes" },
  { id: "30", label: "30 minutes" },
  { id: "60", label: "1 hour" },
] as const;

const threadRemoveActionOptions = [
  { id: "archive", label: "Archive" },
  { id: "delete", label: "Delete" },
] as const;

const scrollSpeedOptions = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  label: `${i + 1}x`,
})) as readonly { id: string; label: string }[];

type SettingsSection = "general" | "ai" | "agents" | "git" | "archived" | `agents:${string}`;

function SettingsSidebar(props: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  installedAgents: AgentStatus[];
}) {
  const { activeSection, onSectionChange, onClose, installedAgents } = props;
  const { isCollapsed, collapse, expand } = useSidebar();
  const isAgentsActive = activeSection === "agents" || activeSection.startsWith("agents:");

  const selectFirstAgent = () => {
    const first = installedAgents[0];
    onSectionChange(first ? `agents:${first.kind}` : "agents");
  };

  return (
    <div className="relative h-full">
      {/* Collapsed icon rail */}
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
            <SidebarButton
              iconOnly
              icon={<Sparkles className="size-4" />}
              label="AI"
              isActive={activeSection === "ai"}
              onPress={() => onSectionChange("ai")}
            />
            <SidebarButton
              iconOnly
              icon={<Bot className="size-4" />}
              label="Agents"
              isActive={isAgentsActive}
              onPress={selectFirstAgent}
            />
            {isAgentsActive &&
              installedAgents.map((agent) => (
                <SidebarButton
                  key={agent.kind}
                  iconOnly
                  icon={<ProviderIcon kind={agent.kind} className="size-4" />}
                  label={agent.label}
                  isActive={activeSection === `agents:${agent.kind}`}
                  onPress={() => onSectionChange(`agents:${agent.kind}`)}
                />
              ))}
            <SidebarButton
              iconOnly
              icon={<GitBranch className="size-4" />}
              label="Git"
              isActive={activeSection === "git"}
              onPress={() => onSectionChange("git")}
            />
            <SidebarButton
              iconOnly
              icon={<Archive className="size-4" />}
              label="Archived Threads"
              isActive={activeSection === "archived"}
              onPress={() => onSectionChange("archived")}
            />
          </div>
          <div className="space-y-1 border-t border-white/6 pt-2 pr-2">
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label="Return to app"
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      {/* Expanded sidebar */}
      <div
        className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
          <div className="space-y-0.5">
            <SidebarButton
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
            <SidebarButton
              icon={<Sparkles className="size-4" />}
              label="AI"
              isActive={activeSection === "ai"}
              onPress={() => onSectionChange("ai")}
            />
            <SidebarButton
              icon={<Bot className="size-4" />}
              label="Agents"
              isActive={isAgentsActive && !activeSection.startsWith("agents:")}
              onPress={selectFirstAgent}
            />
            {isAgentsActive && (
              <div className="space-y-0.5 pl-4">
                {installedAgents.map((agent) => (
                  <SidebarButton
                    key={agent.kind}
                    icon={<ProviderIcon kind={agent.kind} className="size-4" />}
                    label={agent.label}
                    isActive={activeSection === `agents:${agent.kind}`}
                    onPress={() => onSectionChange(`agents:${agent.kind}`)}
                  />
                ))}
              </div>
            )}
            <SidebarButton
              icon={<GitBranch className="size-4" />}
              label="Git"
              isActive={activeSection === "git"}
              onPress={() => onSectionChange("git")}
            />
            <SidebarButton
              icon={<Archive className="size-4" />}
              label="Archived Threads"
              isActive={activeSection === "archived"}
              onPress={() => onSectionChange("archived")}
            />
          </div>
        </div>

        <div className="space-y-1 border-t border-white/6 pt-2">
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label="Return to app"
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  const themeMode = useSharedSettings((state) => state.themeMode);
  const setThemeMode = useSharedSettings((state) => state.setThemeMode);
  const terminalPosition = useSharedSettings((state) => state.terminalPosition);
  const setTerminalPosition = useSharedSettings((state) => state.setTerminalPosition);
  const collapseTerminalComposer = useSharedSettings((state) => state.collapseTerminalComposer);
  const setCollapseTerminalComposer = useSharedSettings(
    (state) => state.setCollapseTerminalComposer,
  );
  const staleThreadUnloadMinutes = useSharedSettings((state) => state.staleThreadUnloadMinutes);
  const setStaleThreadUnloadMinutes = useSharedSettings(
    (state) => state.setStaleThreadUnloadMinutes,
  );
  const scrollSpeed = useSharedSettings((state) => state.scrollSpeed);
  const setScrollSpeed = useSharedSettings((state) => state.setScrollSpeed);
  const preventSleepWhileWorking = useSharedSettings(
    (state) => state.preventSleepWhileWorking,
  );
  const setPreventSleepWhileWorking = useSharedSettings(
    (state) => state.setPreventSleepWhileWorking,
  );
  const threadRemoveAction = useSharedSettings((state) => state.threadRemoveAction);
  const setThreadRemoveAction = useSharedSettings((state) => state.setThreadRemoveAction);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">General</h1>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-xs text-muted">Choose how Lightcode looks.</p>
            </div>
            <Select
              aria-label="Theme"
              className="w-[160px] shrink-0"
              options={themeOptions}
              value={themeMode}
              onChange={(value) => {
                startTransition(() => {
                  setThemeMode(value as ThemeMode);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Terminal position</p>
              <p className="text-xs text-muted">Where the terminal panel appears.</p>
            </div>
            <Select
              aria-label="Terminal position"
              className="w-[160px] shrink-0"
              options={terminalPositionOptions}
              value={terminalPosition}
              onChange={(value) => {
                startTransition(() => {
                  setTerminalPosition(value as TerminalPosition);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Collapse terminal composer</p>
              <p className="text-xs text-muted">
                Hide the composer by default in terminal-native threads.
              </p>
            </div>
            <Switch
              isSelected={collapseTerminalComposer}
              onChange={(selected) => {
                startTransition(() => {
                  setCollapseTerminalComposer(selected);
                });
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Unload idle threads after</p>
              <p className="text-xs text-muted">
                Hidden resumable threads are swept every 5 minutes and unloaded after this idle age.
              </p>
            </div>
            <Select
              aria-label="Unload idle threads after"
              className="w-[160px] shrink-0"
              options={staleThreadUnloadOptions}
              value={String(staleThreadUnloadMinutes)}
              onChange={(value) => {
                startTransition(() => {
                  setStaleThreadUnloadMinutes(Number.parseInt(value, 10) || 0);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Terminal scroll speed</p>
              <p className="text-xs text-muted">
                Scroll speed multiplier for the terminal scrollback buffer.
              </p>
            </div>
            <Select
              aria-label="Terminal scroll speed"
              className="w-[160px] shrink-0"
              options={scrollSpeedOptions}
              value={String(scrollSpeed)}
              onChange={(value) => {
                startTransition(() => {
                  setScrollSpeed(Number.parseInt(value, 10) || 2);
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Prevent sleep while working</p>
              <p className="text-xs text-muted">
                Keep the system awake while any thread is actively working.
              </p>
            </div>
            <Switch
              isSelected={preventSleepWhileWorking}
              onChange={(selected) => {
                startTransition(() => {
                  setPreventSleepWhileWorking(selected);
                });
              }}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Default thread removal</p>
              <p className="text-xs text-muted">
                Action for the quick-remove button on sidebar threads.
              </p>
            </div>
            <Select
              aria-label="Default thread removal"
              className="w-[160px] shrink-0"
              options={threadRemoveActionOptions}
              value={threadRemoveAction}
              onChange={(value) => {
                startTransition(() => {
                  setThreadRemoveAction(value as ThreadRemoveAction);
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function GenConfigSection(props: {
  heading: string;
  providerLabel: string;
  modelLabel: string;
  effortLabel: string;
  provider: string;
  model: string;
  effort: string;
  resolve: (
    agent: AgentStatus | undefined,
    model: string,
    effort: string,
  ) => { model: string; effort: string; availableEfforts: string[] };
  allowDisabled?: boolean;
  /** Tooltip hint showing default models per provider (shown on heading hover). */
  defaultsHint?: string | undefined;
  agentStatuses: AgentStatus[];
  onConfigChange: (provider: string, model: string, effort: string) => void;
}) {
  const {
    heading,
    providerLabel,
    modelLabel,
    effortLabel,
    provider,
    model,
    effort,
    resolve,
    onConfigChange,
  } = props;
  const agentStatuses = props.agentStatuses;
  const installedAgents = agentStatuses.filter((a) => a.installed);
  const isDisabled = provider === "disabled";
  const selectedAgent =
    provider !== "auto" && !isDisabled
      ? installedAgents.find((a) => a.kind === provider)
      : undefined;
  const resolved = resolve(selectedAgent, model, effort);

  const providerOptions = [
    ...(props.allowDisabled ? [{ id: "disabled", label: "Disabled" }] : []),
    { id: "auto", label: "Auto (Recommended)" },
    ...installedAgents.map((a) => ({ id: a.kind, label: a.label })),
  ];

  const modelOptions = selectedAgent ? [...selectedAgent.capabilities.models] : [];

  const effortOptions = selectedAgent
    ? resolved.availableEfforts.map((id) => ({
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
      }))
    : [];

  return (
    <div className="space-y-4">
      {props.defaultsHint ? (
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <h2 className="w-fit cursor-default text-sm font-semibold text-muted">{heading}</h2>
          </Tooltip.Trigger>
          <Tooltip.Content className="text-xs">{props.defaultsHint}</Tooltip.Content>
        </Tooltip>
      ) : (
        <h2 className="text-sm font-semibold text-muted">{heading}</h2>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Provider</p>
          <p className="text-xs text-muted">{providerLabel}</p>
        </div>
        <Select
          aria-label="Provider"
          className="w-[200px] shrink-0"
          options={providerOptions}
          value={provider}
          onChange={(value) => {
            if (value === "auto" || value === "disabled") {
              onConfigChange(value, "", "");
            } else {
              const agent = installedAgents.find((a) => a.kind === value);
              const next = resolve(agent, "", "");
              onConfigChange(value, next.model, next.effort);
            }
          }}
        />
      </div>

      {selectedAgent && modelOptions.length > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Model</p>
            <p className="text-xs text-muted">{modelLabel}</p>
          </div>
          <Select
            aria-label="Model"
            className="w-[200px] shrink-0"
            options={modelOptions}
            value={resolved.model}
            onChange={(value) => {
              const next = resolve(selectedAgent, value, effort);
              onConfigChange(provider, next.model, next.effort);
            }}
          />
        </div>
      ) : null}

      {selectedAgent && effortOptions.length > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Effort</p>
            <p className="text-xs text-muted">{effortLabel}</p>
          </div>
          <Select
            aria-label="Effort"
            className="w-[200px] shrink-0"
            options={effortOptions}
            value={resolved.effort}
            onChange={(value) => onConfigChange(provider, resolved.model, value)}
          />
        </div>
      ) : null}
    </div>
  );
}

type EnvKind = "windows" | "wsl";

function AISettings() {
  const [envKind, setEnvKind] = useState<EnvKind>("windows");

  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAppStore((s) => s.wslAgentStatuses);
  const hasWsl = wslAgentStatuses.length > 0;
  const activeStatuses = envKind === "wsl" ? wslAgentStatuses : agentStatuses;

  const titleGenProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenProvider : s.titleGenProvider,
  );
  const titleGenModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenModel : s.titleGenModel,
  );
  const titleGenEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslTitleGenEffort : s.titleGenEffort,
  );
  const setTitleGenConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslTitleGenConfig : s.setTitleGenConfig,
  );

  const commitGenProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenProvider : s.commitGenProvider,
  );
  const commitGenModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenModel : s.commitGenModel,
  );
  const commitGenEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslCommitGenEffort : s.commitGenEffort,
  );
  const setCommitGenConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslCommitGenConfig : s.setCommitGenConfig,
  );

  const conflictResolverProvider = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverProvider : s.conflictResolverProvider,
  );
  const conflictResolverModel = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverModel : s.conflictResolverModel,
  );
  const conflictResolverEffort = useSharedSettings((s) =>
    envKind === "wsl" ? s.wslConflictResolverEffort : s.conflictResolverEffort,
  );
  const setConflictResolverConfig = useSharedSettings((s) =>
    envKind === "wsl" ? s.setWslConflictResolverConfig : s.setConflictResolverConfig,
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">AI</h1>
          {hasWsl ? (
            <ToggleButtonGroup
              aria-label="Environment"
              className="h-7 [&_button]:h-7 [&_button]:min-h-0 [&_button]:min-w-0 [&_button]:px-2"
              selectionMode="single"
              disallowEmptySelection
              size="sm"
              selectedKeys={[envKind]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as EnvKind | undefined;
                if (next) setEnvKind(next);
              }}
            >
              <ToggleButton isIconOnly id="windows" aria-label="Windows">
                <Monitor className="size-3.5" />
              </ToggleButton>
              <ToggleButton isIconOnly id="wsl" aria-label="WSL">
                <ToggleButtonGroup.Separator />
                <TuxIcon className="size-7" />
              </ToggleButton>
            </ToggleButtonGroup>
          ) : null}
        </div>

        <div className="space-y-8">
          <GenConfigSection
            heading="Title Generation"
            allowDisabled
            providerLabel="Agent used to generate thread titles."
            modelLabel="Model for title generation."
            effortLabel="Reasoning effort for generation."
            defaultsHint={getTitleGenDefaultsHint()}
            agentStatuses={activeStatuses}
            provider={titleGenProvider}
            model={titleGenModel}
            effort={titleGenEffort}
            resolve={resolveTitleGenConfig}
            onConfigChange={setTitleGenConfig}
          />

          <GenConfigSection
            heading="Commit Message Generation"
            providerLabel="Agent used to generate commit messages."
            modelLabel="Model for commit message generation."
            effortLabel="Reasoning effort for generation."
            defaultsHint={getCommitGenDefaultsHint()}
            agentStatuses={activeStatuses}
            provider={commitGenProvider}
            model={commitGenModel}
            effort={commitGenEffort}
            resolve={resolveCommitGenConfig}
            onConfigChange={setCommitGenConfig}
          />

          <GenConfigSection
            heading="Conflict Resolver"
            providerLabel="Agent used to resolve merge conflicts."
            modelLabel="Model for conflict resolution."
            effortLabel="Reasoning effort for resolution."
            defaultsHint={getConflictResolverDefaultsHint()}
            agentStatuses={activeStatuses}
            provider={conflictResolverProvider}
            model={conflictResolverModel}
            effort={conflictResolverEffort}
            resolve={resolveConflictResolverConfig}
            onConfigChange={setConflictResolverConfig}
          />
        </div>
      </div>
    </div>
  );
}

function AgentSettingRow(props: { agentKind: string; def: AgentSettingDef }) {
  const { agentKind, def } = props;
  const value = useSharedSettings((s) => s.agentSettings[agentKind]?.[def.key] ?? def.default);
  const setAgentSetting = useSharedSettings((s) => s.setAgentSetting);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <p className="text-xs text-muted">{def.description}</p>
      </div>
      {def.type === "toggle" ? (
        <Switch
          isSelected={value as boolean}
          onChange={(selected) => {
            startTransition(() => {
              setAgentSetting(agentKind, def.key, selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      ) : (
        <Select
          aria-label={def.label}
          className="w-[160px] shrink-0"
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

function ModelVisibilityDropdown(props: {
  agentKind: string;
  models: readonly { id: string; label: string }[];
}) {
  const { agentKind, models } = props;
  const hiddenIds = useSharedSettings((s) => s.hiddenModels[agentKind]);
  const setHiddenModels = useSharedSettings((s) => s.setHiddenModels);

  const hidden = hiddenIds ?? [];
  const hiddenSet = new Set(hidden);
  const visibleKeys: Selection = new Set(
    models.filter((m) => !hiddenSet.has(m.id)).map((m) => m.id),
  );
  const hiddenCount = hidden.length;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Visible models</p>
        <p className="text-xs text-muted">Toggle models off to hide them from the selector.</p>
      </div>
      <Dropdown>
        <Button variant="secondary" size="sm" className="min-w-[4.5rem] tabular-nums">
          {models.length - hiddenCount} / {models.length}
        </Button>
        <Dropdown.Popover className="min-w-[280px]">
          <Dropdown.Menu
            className="max-h-[400px] overflow-y-auto"
            selectedKeys={visibleKeys}
            selectionMode="multiple"
            onSelectionChange={(keys) => {
              const selected =
                keys === "all" ? new Set(models.map((m) => m.id)) : (keys as Set<string>);
              const nextHidden = models.filter((m) => !selected.has(m.id)).map((m) => m.id);
              setHiddenModels(agentKind, nextHidden);
            }}
          >
            {models.map((m) => (
              <Dropdown.Item key={m.id} id={m.id} textValue={m.label}>
                <Dropdown.ItemIndicator />
                <Label>{m.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

function SingleAgentSettings(props: { agentKind: string }) {
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const platform = navigator.platform.toLowerCase().includes("win") ? "win32" : "posix";
  const agent = agentStatuses.find((a) => a.kind === props.agentKind && a.installed);

  if (!agent) {
    return (
      <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
        <div className="mx-auto max-w-[560px]">
          <h1 className="mb-6 text-lg font-semibold text-foreground">Agent not found</h1>
          <p className="text-sm text-muted">This agent is not installed.</p>
        </div>
      </div>
    );
  }

  const defs = (agent.capabilities.settingDefs ?? []).filter(
    (def) => !def.platforms || def.platforms.includes(platform),
  );
  const models = agent.capabilities.models.filter((m) => m.id !== "auto");

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">{agent.label}</h1>

        {defs.length > 0 && (
          <div className="space-y-4">
            {defs.map((def) => (
              <AgentSettingRow key={def.key} agentKind={agent.kind} def={def} />
            ))}
          </div>
        )}

        {models.length > 0 && (
          <div className={defs.length > 0 ? "mt-8 space-y-4" : "space-y-4"}>
            <ModelVisibilityDropdown agentKind={agent.kind} models={models} />
          </div>
        )}

        {defs.length === 0 && models.length === 0 && (
          <p className="text-sm text-muted">No settings available for this agent.</p>
        )}
      </div>
    </div>
  );
}

function AgentSettingsEmpty() {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted">No agents installed.</p>
      </div>
    </div>
  );
}

function GitSettings() {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Git</h1>

        <p className="text-sm text-muted">No git-specific settings yet.</p>
      </div>
    </div>
  );
}

function ArchivedThreadsSettings() {
  const threads = useAppStore((s) => s.threads);
  const projects = useAppStore((s) => s.projects);
  const unarchiveThread = useAppStore((s) => s.unarchiveThread);
  const deleteThread = useAppStore((s) => s.deleteThread);
  const archivedThreads = threads.filter((t) => t.archived);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Archived Threads</h1>

        {archivedThreads.length === 0 ? (
          <p className="text-sm text-muted">No archived threads.</p>
        ) : (
          <Surface variant="secondary" className="divide-y divide-white/6 rounded-xl">
            {archivedThreads.map((thread) => {
              const project = projects.find((p) => p.id === thread.projectId);
              return (
                <div key={thread.id} className="flex items-center gap-3 px-4 py-3">
                  <ProviderIcon kind={thread.agentKind} className="size-4 shrink-0 text-muted" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-sm font-medium text-foreground">{thread.title}</p>
                    {project && <p className="truncate text-xs text-muted">{project.name}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Tooltip delay={150}>
                      <Tooltip.Trigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          aria-label="Restore thread"
                          onPress={() => unarchiveThread(thread.id)}
                        >
                          <ArchiveRestore className="size-4" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>Restore thread</Tooltip.Content>
                    </Tooltip>
                    <Tooltip delay={150}>
                      <Tooltip.Trigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          aria-label="Delete thread"
                          onPress={() => deleteThread(thread.id)}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>Delete permanently</Tooltip.Content>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </Surface>
        )}
      </div>
    </div>
  );
}

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const installedAgents = agentStatuses.filter((a) => a.installed);

  const agentKind = activeSection.startsWith("agents:") ? activeSection.slice(7) : undefined;

  return (
    <PageLayout
      title="Settings"
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
          installedAgents={installedAgents}
        />
      }
      content={
        activeSection === "general" ? (
          <GeneralSettings />
        ) : activeSection === "ai" ? (
          <AISettings />
        ) : agentKind ? (
          <SingleAgentSettings agentKind={agentKind} />
        ) : activeSection === "agents" ? (
          <AgentSettingsEmpty />
        ) : activeSection === "git" ? (
          <GitSettings />
        ) : activeSection === "archived" ? (
          <ArchivedThreadsSettings />
        ) : null
      }
    />
  );
}
