import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectScripts } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useProject } from "@/renderer/state/useThread";
import { TextArea } from "@/renderer/components/common";
import { parseCopyPatterns } from "@/shared/worktree";
import { ProjectWorktreeLocation } from "./ProjectWorktreeLocation";

export function ScriptsSection(props: { projectId: string }) {
  const { t } = useLingui();
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
        <h1 className="mb-6 text-lg font-semibold text-foreground">
          <Trans>Worktrees</Trans>
        </h1>

        <div className="space-y-6">
          <ProjectWorktreeLocation projectId={props.projectId} />

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                <Trans>Setup script</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>
                  Runs in a terminal after a new worktree is created (e.g.,{" "}
                  <code>pnpm install</code>).
                </Trans>
              </p>
            </div>
            <TextArea
              aria-label={t`Setup script`}
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
              <p className="text-sm font-medium text-foreground">
                <Trans>Cleanup script</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>
                  Runs before a worktree is removed (e.g., <code>rm -rf node_modules</code>).
                </Trans>
              </p>
            </div>
            <TextArea
              aria-label={t`Cleanup script`}
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
              <p className="text-sm font-medium text-foreground">
                <Trans>Copy ignored files</Trans>
              </p>
              <p className="text-xs text-muted">
                <Trans>
                  Gitignored files to copy from the main project into each new worktree.
                  Gitignore-style patterns, one per line (e.g., <code>.env.*</code>).
                </Trans>
              </p>
            </div>
            <TextArea
              aria-label={t`Copy ignored files`}
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
