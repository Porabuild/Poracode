import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Plus, Trash2 } from "lucide-react";
import type { ProjectAction } from "@/shared/contracts";
import { updateProjectScripts } from "@/renderer/actions/projectActions";
import { useProject } from "@/renderer/state/useThread";
import { Button, Input, TextArea } from "@/renderer/components/common";
import { ActionIconPicker } from "./ActionIconPicker";

export function ActionsSection(props: { projectId: string }) {
  const { t } = useLingui();
  const project = useProject(props.projectId);

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
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">
          <Trans>Actions</Trans>
        </h1>
        <p className="mb-4 text-xs text-muted">
          <Trans>Custom commands available from the project context menu (right-click).</Trans>
        </p>

        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="group rounded-lg border border-[var(--hairline)] bg-[var(--row-hover)] p-3"
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
                  aria-label={t`Action name`}
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
                  aria-label={t`Remove action`}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onPress={() => removeAction(action.id)}
                >
                  <Trash2 className="size-3.5 text-danger" />
                </Button>
              </div>
              <TextArea
                aria-label={t`Action command`}
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

          <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <ActionIconPicker value={newIcon} onChange={setNewIcon} />
              <Input
                aria-label={t`New action name`}
                className="min-w-0 flex-1"
                placeholder={t`Action name`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAction();
                }}
              />
            </div>
            <TextArea
              aria-label={t`New action command`}
              className="mb-3 w-full font-mono text-xs"
              rows={2}
              placeholder={t`Command (e.g., npm run dev)`}
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
              <Trans>Add action</Trans>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
