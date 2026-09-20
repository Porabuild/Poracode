import { useState } from "react";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronUp } from "lucide-react";
import type { Project } from "@/shared/contracts";
import {
  ProjectSelectorIcon,
  useProjectRemoteServerLookup,
} from "@/renderer/components/common/ProjectRemoteServer";
import { ResponsiveMenuSurface } from "@/renderer/components/common/ResponsiveMenuSurface";

/** Compact floating selector for a project-scoped mobile page. */
export function MobileProjectPicker(props: {
  readonly projects: readonly Project[];
  readonly selectedProject: Project;
  readonly onChange: (projectId: string) => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const remoteServerFor = useProjectRemoteServerLookup();
  const selectedRemote = remoteServerFor(props.selectedProject);

  const choose = (projectId: string) => {
    setOpen(false);
    props.onChange(projectId);
  };

  return (
    <ResponsiveMenuSurface
      isOpen={open}
      onOpenChange={setOpen}
      label={t`Project`}
      trigger={
        <Button
          variant="ghost"
          className="m-floating-selector pointer-events-auto px-4 text-sm"
          aria-label={t`Project`}
          aria-expanded={open}
          onPress={() => setOpen(true)}
        >
          <ProjectSelectorIcon project={props.selectedProject} remote={selectedRemote} />
          <span className="min-w-0 truncate font-medium">{props.selectedProject.name}</span>
          {selectedRemote.serverName ? (
            <span className="min-w-0 shrink truncate text-xs text-muted">
              {selectedRemote.serverName}
            </span>
          ) : null}
          <ChevronUp className="size-4 shrink-0 text-muted" />
        </Button>
      }
    >
      <div className="m-sheet-list">
        {props.projects.map((project) => {
          const remote = remoteServerFor(project);
          const selected = project.id === props.selectedProject.id;
          return (
            <button
              key={project.id}
              type="button"
              className="m-sheet-action"
              aria-pressed={selected || undefined}
              onClick={() => choose(project.id)}
            >
              <ProjectSelectorIcon project={project} remote={remote} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {remote.serverName ? (
                <span className="max-w-28 shrink-0 truncate text-xs text-muted/60">
                  {remote.serverName}
                </span>
              ) : null}
              {selected ? <Check className="size-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </ResponsiveMenuSurface>
  );
}
