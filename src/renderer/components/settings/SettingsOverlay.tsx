import { ArrowLeft, GitBranch, PanelLeft, PanelLeftClose, Settings2, Sparkles } from "lucide-react";
import { startTransition, useState } from "react";
import type { ThemeMode } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { resolveCommitGenConfig, resolveTitleGenConfig } from "../providers";
import { Select, SidebarButton } from "../common";
import { useSidebar } from "../layout/AppShell";
import { PageLayout } from "../layout/PageLayout";

const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

type SettingsSection = "general" | "ai" | "git";

function SettingsSidebar(props: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  const { activeSection, onSectionChange, onClose } = props;
  const { isCollapsed, collapse, expand } = useSidebar();

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
    agent: import("../../../shared/contracts").AgentStatus | undefined,
    model: string,
    effort: string,
  ) => { model: string; effort: string; availableEfforts: string[] };
  allowDisabled?: boolean;
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
  const agentStatuses = useAppStore((s) => s.agentStatuses);
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
      <h2 className="text-sm font-semibold text-muted">{heading}</h2>

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

function AISettings() {
  const titleGenProvider = useSharedSettings((s) => s.titleGenProvider);
  const titleGenModel = useSharedSettings((s) => s.titleGenModel);
  const titleGenEffort = useSharedSettings((s) => s.titleGenEffort);
  const setTitleGenConfig = useSharedSettings((s) => s.setTitleGenConfig);
  const commitGenProvider = useSharedSettings((s) => s.commitGenProvider);
  const commitGenModel = useSharedSettings((s) => s.commitGenModel);
  const commitGenEffort = useSharedSettings((s) => s.commitGenEffort);
  const setCommitGenConfig = useSharedSettings((s) => s.setCommitGenConfig);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">AI</h1>

        <div className="space-y-8">
          <GenConfigSection
            heading="Title Generation"
            allowDisabled
            providerLabel="Agent used to generate thread titles."
            modelLabel="Model for title generation."
            effortLabel="Reasoning effort for generation."
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
            provider={commitGenProvider}
            model={commitGenModel}
            effort={commitGenEffort}
            resolve={resolveCommitGenConfig}
            onConfigChange={setCommitGenConfig}
          />
        </div>
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

  return (
    <PageLayout
      title="Settings"
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
        />
      }
      content={
        activeSection === "general" ? (
          <GeneralSettings />
        ) : activeSection === "ai" ? (
          <AISettings />
        ) : activeSection === "git" ? (
          <GitSettings />
        ) : null
      }
    />
  );
}
