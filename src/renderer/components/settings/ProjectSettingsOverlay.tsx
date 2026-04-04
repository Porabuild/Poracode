import { type ReactNode, useState } from "react";
import {
  ArrowLeft,
  Braces,
  Bug,
  Cog,
  Database,
  FileCode,
  FileText,
  GitFork,
  Gauge,
  Globe,
  Hammer,
  type LucideIcon,
  Package,
  PanelLeft,
  PanelLeftClose,
  Play,
  Plus,
  Rocket,
  Server,
  Settings2,
  Terminal,
  TestTubeDiagonal,
  Trash2,
  Upload,
  Wrench,
  Zap,
} from "lucide-react";
import { Popover } from "@heroui/react";
import type { ProjectAction, ProjectScripts } from "../../../shared/contracts";
import { useAppStore } from "../../state/appStore";
import { Button, Input, SidebarButton, TextArea } from "../common";
import { useSidebar } from "../layout/AppShell";
import { PageLayout } from "../layout/PageLayout";

const ACTION_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "play", Icon: Play },
  { name: "terminal", Icon: Terminal },
  { name: "rocket", Icon: Rocket },
  { name: "hammer", Icon: Hammer },
  { name: "wrench", Icon: Wrench },
  { name: "cog", Icon: Cog },
  { name: "zap", Icon: Zap },
  { name: "bug", Icon: Bug },
  { name: "test-tube", Icon: TestTubeDiagonal },
  { name: "gauge", Icon: Gauge },
  { name: "package", Icon: Package },
  { name: "upload", Icon: Upload },
  { name: "server", Icon: Server },
  { name: "database", Icon: Database },
  { name: "globe", Icon: Globe },
  { name: "file-code", Icon: FileCode },
  { name: "file-text", Icon: FileText },
  { name: "braces", Icon: Braces },
];

export function resolveActionIcon(iconName?: string): ReactNode {
  const entry = ACTION_ICONS.find((i) => i.name === iconName) ?? ACTION_ICONS[0]!;
  return <entry.Icon className="size-4" />;
}

function ActionIconPicker(props: { value: string; onChange: (name: string) => void }) {
  const { value, onChange } = props;
  const selected = ACTION_ICONS.find((i) => i.name === value) ?? ACTION_ICONS[0]!;

  return (
    <Popover>
      <Button
        isIconOnly
        variant="ghost"
        aria-label="Pick icon"
        className="size-8 min-w-0 shrink-0 border border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-foreground"
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
                    : "text-muted hover:bg-white/10 hover:text-foreground"
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

type Section = "general" | "worktrees" | "actions";

function SettingsSidebar(props: {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  onClose: () => void;
}) {
  const { activeSection, onSectionChange, onClose } = props;
  const { isCollapsed, collapse, expand } = useSidebar();

  const sections: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: "general", icon: <Settings2 className="size-4" />, label: "General" },
    { id: "worktrees", icon: <GitFork className="size-4" />, label: "Worktrees" },
    { id: "actions", icon: <Play className="size-4" />, label: "Actions" },
  ];

  return (
    <div className="relative h-full">
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {sections.map((s) => (
              <SidebarButton
                key={s.id}
                iconOnly
                icon={s.icon}
                label={s.label}
                isActive={activeSection === s.id}
                onPress={() => onSectionChange(s.id)}
              />
            ))}
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

      <div
        className={`flex h-full min-h-0 flex-col gap-3 px-3 pb-1 pt-0 transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pr-0.5">
          <div className="space-y-0.5">
            {sections.map((s) => (
              <SidebarButton
                key={s.id}
                icon={s.icon}
                label={s.label}
                isActive={activeSection === s.id}
                onPress={() => onSectionChange(s.id)}
              />
            ))}
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

function GeneralSection(props: { projectId: string }) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === props.projectId));
  const renameProject = useAppStore((s) => s.renameProject);
  const [name, setName] = useState(project?.name ?? "");

  if (!project) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">General</h1>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Project name</p>
              <p className="text-xs text-muted">Display name in the sidebar.</p>
            </div>
            <Input
              aria-label="Project name"
              className="w-[240px] shrink-0"

              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== project.name) {
                  renameProject(project.id, trimmed);
                } else {
                  setName(project.name);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptsSection(props: { projectId: string }) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === props.projectId));
  const updateProjectScripts = useAppStore((s) => s.updateProjectScripts);

  const scripts = project?.scripts ?? { actions: [] };
  const [setupScript, setSetupScript] = useState(scripts.setupScript ?? "");
  const [cleanupScript, setCleanupScript] = useState(scripts.cleanupScript ?? "");

  if (!project) return null;

  function save(patch: Partial<ProjectScripts>) {
    updateProjectScripts(project!.id, { ...scripts, ...patch });
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Worktrees</h1>

        <div className="space-y-6">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Setup script</p>
              <p className="text-xs text-muted">
                Runs in a terminal after a new worktree is created (e.g., <code>pnpm install</code>).
              </p>
            </div>
            <TextArea
              aria-label="Setup script"
              className="w-full font-mono text-xs"
              rows={3}
              placeholder={"pnpm install"}
              value={setupScript}
              onChange={(e) => setSetupScript(e.target.value)}
              onBlur={() => save({ setupScript: setupScript.trim() || undefined })}
            />
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Cleanup script</p>
              <p className="text-xs text-muted">
                Runs before a worktree is removed (e.g., <code>rm -rf node_modules</code>).
              </p>
            </div>
            <TextArea
              aria-label="Cleanup script"
              className="w-full font-mono text-xs"
              rows={3}
              placeholder={"rm -rf node_modules"}
              value={cleanupScript}
              onChange={(e) => setCleanupScript(e.target.value)}
              onBlur={() => save({ cleanupScript: cleanupScript.trim() || undefined })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionsSection(props: { projectId: string }) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === props.projectId));
  const updateProjectScripts = useAppStore((s) => s.updateProjectScripts);

  const scripts = project?.scripts ?? { actions: [] };
  const actions = scripts.actions ?? [];

  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("");
  const [newIcon, setNewIcon] = useState("play");

  if (!project) return null;

  function saveActions(next: ProjectAction[]) {
    updateProjectScripts(project!.id, { ...scripts, actions: next });
  }

  function addAction() {
    const trimName = newName.trim();
    const trimCommand = newCommand.trim();
    if (!trimName || !trimCommand) return;
    const action: ProjectAction = {
      id: crypto.randomUUID(),
      name: trimName,
      command: trimCommand,
      icon: newIcon,
    };
    saveActions([...actions, action]);
    setNewName("");
    setNewCommand("");
    setNewIcon("play");
  }

  function removeAction(actionId: string) {
    saveActions(actions.filter((a) => a.id !== actionId));
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8">
      <div className="mx-auto max-w-[560px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Actions</h1>
        <p className="mb-4 text-xs text-muted">
          Custom commands available from the project context menu (right-click).
        </p>

        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="group rounded-lg border border-white/6 bg-white/[0.02] p-3"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <ActionIconPicker
                  value={action.icon ?? "play"}
                  onChange={(name) => {
                    const updated = actions.map((a) =>
                      a.id === action.id ? { ...a, icon: name } : a,
                    );
                    saveActions(updated);
                  }}
                />
                <Input
                  aria-label="Action name"
                  className="min-w-0 flex-1 font-medium"
                  value={action.name}
                  onChange={(e) => {
                    const updated = actions.map((a) =>
                      a.id === action.id ? { ...a, name: e.target.value } : a,
                    );
                    saveActions(updated);
                  }}
                />
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label="Remove action"
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onPress={() => removeAction(action.id)}
                >
                  <Trash2 className="size-3.5 text-danger" />
                </Button>
              </div>
              <TextArea
                aria-label="Action command"
                className="w-full font-mono text-xs"
                rows={2}
                value={action.command}
                onChange={(e) => {
                  const updated = actions.map((a) =>
                    a.id === action.id ? { ...a, command: e.target.value } : a,
                  );
                  saveActions(updated);
                }}
              />
            </div>
          ))}

          <div className="rounded-lg border border-dashed border-white/10 p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <ActionIconPicker value={newIcon} onChange={setNewIcon} />
              <Input
                aria-label="New action name"
                className="min-w-0 flex-1"
                placeholder="Action name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAction();
                }}
              />
            </div>
            <TextArea
              aria-label="New action command"
              className="mb-3 w-full font-mono text-xs"
              rows={2}
              placeholder={"Command (e.g., npm run dev)"}
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
            />
            <Button
              variant="ghost"
              className="w-full"
              isDisabled={!newName.trim() || !newCommand.trim()}
              onPress={addAction}
            >
              <Plus className="size-4" />
              Add action
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectSettingsOverlay(props: { projectId: string; onClose: () => void }) {
  const { projectId, onClose } = props;
  const projectName = useAppStore((s) => s.projects.find((p) => p.id === projectId)?.name ?? "Project");
  const [activeSection, setActiveSection] = useState<Section>("general");

  return (
    <PageLayout
      title={`${projectName} Settings`}
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
        />
      }
      content={
        activeSection === "general" ? (
          <GeneralSection projectId={projectId} />
        ) : activeSection === "worktrees" ? (
          <ScriptsSection projectId={projectId} />
        ) : activeSection === "actions" ? (
          <ActionsSection projectId={projectId} />
        ) : null
      }
    />
  );
}
