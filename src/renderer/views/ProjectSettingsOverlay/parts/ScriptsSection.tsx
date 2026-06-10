import { useState } from "react";
import type { ProjectScripts } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject } from "@/renderer/state/useThread";
import { TextArea } from "@/renderer/components/common";
import { parseCopyPatterns } from "@/shared/worktree";

export function ScriptsSection(props: { projectId: string }) {
  const project = useProject(props.projectId);
  const updateProjectScripts = useAppStore((s) => s.updateProjectScripts);

  const scripts = project?.scripts ?? { actions: [] };
  const [setupScript, setSetupScript] = useState(scripts.setupScript ?? "");
  const [cleanupScript, setCleanupScript] = useState(scripts.cleanupScript ?? "");
  const [copyPatterns, setCopyPatterns] = useState((scripts.worktreeCopyPatterns ?? []).join("\n"));

  if (!project) return null;

  function save(patch: Partial<ProjectScripts>) {
    updateProjectScripts(project!.id, { ...scripts, ...patch });
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4">
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Worktrees</h1>

        <div className="space-y-6">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Setup script</p>
              <p className="text-xs text-muted">
                Runs in a terminal after a new worktree is created (e.g., <code>pnpm install</code>
                ).
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

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">Copy ignored files</p>
              <p className="text-xs text-muted">
                Gitignored files to copy from the main project into each new worktree.
                Gitignore-style patterns, one per line (e.g., <code>.env.*</code>).
              </p>
            </div>
            <TextArea
              aria-label="Copy ignored files"
              className="w-full font-mono text-xs"
              rows={3}
              placeholder={".env\n.env.*"}
              value={copyPatterns}
              onChange={(e) => setCopyPatterns(e.target.value)}
              onBlur={() => {
                const patterns = parseCopyPatterns(copyPatterns);
                save({ worktreeCopyPatterns: patterns.length > 0 ? patterns : undefined });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
