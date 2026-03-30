import { ArrowLeft, GitBranch, PanelLeft, PanelLeftClose, Settings2 } from "lucide-react";
import { startTransition, useState } from "react";
import type { ThemeMode } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { resolveCommitGenConfig } from "../providers";
import { Select, SidebarButton } from "../common";
import { AppShell, useSidebar } from "../layout/AppShell";
import { OverlayHeader } from "../layout/OverlayHeader";

const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

type SettingsSection = "general" | "git";

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
    <div className="h-full min-h-0 overflow-y-auto px-6 py-8">
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

function GitSettings() {
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const commitGenProvider = useSharedSettings((s) => s.commitGenProvider);
  const commitGenModel = useSharedSettings((s) => s.commitGenModel);
  const commitGenEffort = useSharedSettings((s) => s.commitGenEffort);
  const setCommitGenConfig = useSharedSettings((s) => s.setCommitGenConfig);

  const installedAgents = agentStatuses.filter((a) => a.installed);
  const selectedAgent =
    commitGenProvider !== "auto"
      ? installedAgents.find((a) => a.kind === commitGenProvider)
      : undefined;
  const resolvedCommitGen = resolveCommitGenConfig(selectedAgent, commitGenModel, commitGenEffort);

  const providerOptions = [
    { id: "auto", label: "Auto (Recommended)" },
    ...installedAgents.map((a) => ({ id: a.kind, label: a.label })),
  ];

  const modelOptions = selectedAgent ? [...selectedAgent.capabilities.models] : [];

  const effortOptions = selectedAgent
    ? resolvedCommitGen.availableEfforts.map((id) => ({
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
      }))
    : [];

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Git</h1>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted">Commit Message Generation</h2>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Provider</p>
              <p className="text-xs text-muted">Agent used to generate commit messages.</p>
            </div>
            <Select
              aria-label="Provider"
              className="w-[200px] shrink-0"
              options={providerOptions}
              value={commitGenProvider}
              onChange={(value) => {
                if (value === "auto") {
                  setCommitGenConfig("auto", "", "");
                } else {
                  const agent = installedAgents.find((a) => a.kind === value);
                  const next = resolveCommitGenConfig(agent, "", "");
                  setCommitGenConfig(value, next.model, next.effort);
                }
              }}
            />
          </div>

          {selectedAgent && modelOptions.length > 0 ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Model</p>
                <p className="text-xs text-muted">Model for commit message generation.</p>
              </div>
              <Select
                aria-label="Model"
                className="w-[200px] shrink-0"
                options={modelOptions}
                value={resolvedCommitGen.model}
                onChange={(value) => {
                  const next = resolveCommitGenConfig(selectedAgent, value, commitGenEffort);
                  setCommitGenConfig(commitGenProvider, next.model, next.effort);
                }}
              />
            </div>
          ) : null}

          {selectedAgent && effortOptions.length > 0 ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Effort</p>
                <p className="text-xs text-muted">Reasoning effort for generation.</p>
              </div>
              <Select
                aria-label="Effort"
                className="w-[200px] shrink-0"
                options={effortOptions}
                value={resolvedCommitGen.effort}
                onChange={(value) =>
                  setCommitGenConfig(commitGenProvider, resolvedCommitGen.model, value)
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  return (
    <>
      <OverlayHeader title="Settings" />

      <div className="lightcode-overlay-body min-h-0 flex-1">
        <AppShell
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
            ) : activeSection === "git" ? (
              <GitSettings />
            ) : null
          }
        />
      </div>
    </>
  );
}
