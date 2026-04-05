import { Switch, ToggleButton, ToggleButtonGroup, Tooltip } from "@heroui/react";
import {
  ArrowLeft,
  Bot,
  GitBranch,
  Monitor,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  Sparkles,
} from "lucide-react";
import { startTransition, useState } from "react";
import type { AgentSettingDef, AgentStatus, TerminalPosition, ThemeMode } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { resolveCommitGenConfig, resolveTitleGenConfig, resolveConflictResolverConfig } from "../providers";
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

type SettingsSection = "general" | "ai" | "agents" | "git" | `agents:${string}`;

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
  defaultsHint?: string;
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
            defaultsHint="Defaults: Claude → Haiku, Codex → GPT-5.4 Mini, Gemini → Flash Lite"
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
            defaultsHint="Defaults: Claude → Haiku, Codex → GPT-5.4 Mini, Gemini → Flash"
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
            defaultsHint="Defaults: Claude → Opus, Codex → GPT-5.4, Gemini → Auto"
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

function AgentSettingToggle(props: {
  agentKind: string;
  def: AgentSettingDef;
}) {
  const { agentKind, def } = props;
  const value = useSharedSettings(
    (s) => s.agentSettings[agentKind]?.[def.key] ?? def.default,
  );
  const setAgentSetting = useSharedSettings((s) => s.setAgentSetting);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <p className="text-xs text-muted">{def.description}</p>
      </div>
      <Switch
        isSelected={value}
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

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">{agent.label}</h1>

        {defs.length === 0 ? (
          <p className="text-sm text-muted">No settings available for this agent.</p>
        ) : (
          <div className="space-y-4">
            {defs.map((def) => (
              <AgentSettingToggle
                key={def.key}
                agentKind={agent.kind}
                def={def}
              />
            ))}
          </div>
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

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const installedAgents = agentStatuses.filter((a) => a.installed);

  const agentKind = activeSection.startsWith("agents:")
    ? activeSection.slice(7)
    : undefined;

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
        ) : null
      }
    />
  );
}
