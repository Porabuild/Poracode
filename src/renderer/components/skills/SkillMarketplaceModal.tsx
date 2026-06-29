import { useState } from "react";
import { Button, Label, Modal, toast } from "@heroui/react";
import { Check, Download, ExternalLink, GitBranch, Star } from "lucide-react";
import type { ProjectLocation } from "@/shared/contracts";
import { SKILL_MARKETPLACE } from "@/shared/skills";
import { readBridge } from "@/renderer/bridge";
import { Input, Select } from "@/renderer/components/common";

export interface MarketplaceTargetScope {
  id: string;
  label: string;
  absolutePath: string;
  /** Folder names already present in this scope (used to avoid name collisions). */
  installedFolders: string[];
  /** `metadata.source` ids already installed here (to mark catalog items installed). */
  installedSources: string[];
}

/** Append a numeric suffix until the folder name is unique within the scope. */
function uniqueFolderName(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${desired}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desired}-${Date.now()}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SkillMarketplaceModal(props: {
  open: boolean;
  onClose: () => void;
  onInstalled: () => void;
  projectLocation?: ProjectLocation;
  targetScopes: MarketplaceTargetScope[];
}) {
  const { open, onClose, onInstalled, projectLocation, targetScopes } = props;
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[720px]">
          {open ? (
            <MarketplaceContent
              targetScopes={targetScopes}
              {...(projectLocation ? { projectLocation } : {})}
              onClose={onClose}
              onInstalled={onInstalled}
            />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function MarketplaceContent(props: {
  targetScopes: MarketplaceTargetScope[];
  projectLocation?: ProjectLocation;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const { targetScopes, projectLocation, onInstalled } = props;
  const operationContext = projectLocation ? { projectLocation } : {};
  const [targetId, setTargetId] = useState(targetScopes[0]?.id ?? "");
  const [installing, setInstalling] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [gitPath, setGitPath] = useState("");

  const target = targetScopes.find((scope) => scope.id === targetId) ?? targetScopes[0] ?? null;
  const sorted = [...SKILL_MARKETPLACE].sort((a, b) => b.popularity - a.popularity);
  // "Installed" is decided by provenance (metadata.source), not folder name, so
  // an unrelated folder that happens to share a name isn't mislabeled.
  const installedSources = new Set(target?.installedSources ?? []);
  const installedFolders = new Set(target?.installedFolders ?? []);

  async function installCatalog(catalogId: string, defaultFolder: string) {
    if (!target) return;
    setInstalling(catalogId);
    try {
      // Pick a non-colliding folder name so re-installing never dead-ends on
      // an "already exists" error.
      const folderName = uniqueFolderName(defaultFolder, installedFolders);
      const result = await readBridge().installMarketplaceSkill({
        ...operationContext,
        catalogId,
        targetScopeDir: target.absolutePath,
        folderName,
      });
      toast.success(`Installed “${result.folderName}” into ${target.label}.`);
      onInstalled();
    } catch (err) {
      toast.danger(errorMessage(err, "Couldn't install the skill."));
    } finally {
      setInstalling(null);
    }
  }

  async function installGit() {
    if (!target || !gitUrl.trim()) return;
    setInstalling("__git__");
    try {
      const result = await readBridge().installSkillFromGit({
        ...operationContext,
        repoUrl: gitUrl.trim(),
        ...(gitPath.trim() ? { sourcePath: gitPath.trim() } : {}),
        targetScopeDir: target.absolutePath,
      });
      toast.success(`Installed “${result.folderName}” into ${target.label}.`);
      setGitUrl("");
      setGitPath("");
      onInstalled();
    } catch (err) {
      toast.danger(errorMessage(err, "Couldn't install from git."));
    } finally {
      setInstalling(null);
    }
  }

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>Skill marketplace</Modal.Heading>
        <p className="mt-1 text-xs text-muted">
          Install a popular skill, or pull any skill folder from a git repository.
        </p>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted">Install into</Label>
          {targetScopes.length > 0 ? (
            <Select
              aria-label="Install destination"
              className="min-w-[220px]"
              options={targetScopes.map((scope) => ({ id: scope.id, label: scope.label }))}
              value={targetId}
              onChange={setTargetId}
            />
          ) : (
            <span className="text-xs text-danger">No writable scope available.</span>
          )}
        </div>

        <div className="-mr-1 flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
          {sorted.map((entry) => {
            const isInstalled = installedSources.has(entry.id);
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-default-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-muted/70">
                      <Star className="size-3" />
                      {entry.popularity}
                    </span>
                    {entry.homepage ? (
                      <button
                        type="button"
                        className="flex items-center gap-0.5 text-[10px] text-accent underline-offset-2 hover:underline"
                        onClick={() => void readBridge().openExternal(entry.homepage!)}
                      >
                        source <ExternalLink className="size-2.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{entry.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-content2 px-1.5 py-0.5 text-[10px] text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {isInstalled ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-success">
                    <Check className="size-3.5" />
                    Installed
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="tertiary"
                    className="shrink-0 gap-1.5"
                    isDisabled={!target || installing !== null}
                    isPending={installing === entry.id}
                    onPress={() => void installCatalog(entry.id, entry.folderName)}
                  >
                    <Download className="size-3.5" />
                    Install
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-default-300 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <GitBranch className="size-3.5" />
            Install from git
          </div>
          <Input
            aria-label="Repository URL"
            placeholder="https://github.com/owner/repo"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
          />
          <Input
            aria-label="Path within repo (optional)"
            placeholder="path/to/skill (optional — defaults to repo root)"
            value={gitPath}
            onChange={(e) => setGitPath(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="tertiary"
              className="gap-1.5"
              isDisabled={!target || !gitUrl.trim() || installing !== null}
              isPending={installing === "__git__"}
              onPress={() => void installGit()}
            >
              <Download className="size-3.5" />
              Clone & install
            </Button>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="ghost" className="text-muted">
          Done
        </Button>
      </Modal.Footer>
    </>
  );
}
