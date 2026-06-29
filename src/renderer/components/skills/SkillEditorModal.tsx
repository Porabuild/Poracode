import { useEffect, useRef, useState } from "react";
import { Button, Label, Modal, toast } from "@heroui/react";
import type { ProjectLocation, SkillSummary } from "@/shared/contracts";
import { slugifySkillName } from "@/shared/skills";
import { readBridge } from "@/renderer/bridge";
import { Input, PixelLoader, TextArea } from "@/renderer/components/common";

export type SkillEditorTarget =
  | { mode: "create"; scopeDir: string; scopeLabel: string }
  | { mode: "edit"; skill: SkillSummary };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SkillEditorModal(props: {
  target: SkillEditorTarget | null;
  projectLocation?: ProjectLocation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { target, projectLocation, onClose, onSaved } = props;
  return (
    <Modal.Backdrop isOpen={target !== null} onOpenChange={(next) => !next && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[680px]">
          {target ? (
            <SkillEditorForm
              target={target}
              {...(projectLocation ? { projectLocation } : {})}
              onClose={onClose}
              onSaved={onSaved}
            />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function SkillEditorForm(props: {
  target: SkillEditorTarget;
  projectLocation?: ProjectLocation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { target, projectLocation, onClose, onSaved } = props;
  const isCreate = target.mode === "create";
  const operationContext = projectLocation ? { projectLocation } : {};

  const [name, setName] = useState(isCreate ? "" : target.skill.name);
  const [folderName, setFolderName] = useState(isCreate ? "" : target.skill.folderName);
  const folderTouched = useRef(!isCreate);
  const [description, setDescription] = useState(isCreate ? "" : target.skill.description);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!isCreate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode: load the raw SKILL.md so the user can edit it directly.
  useEffect(() => {
    if (target.mode !== "edit") return;
    let active = true;
    setLoading(true);
    void readBridge()
      .readSkill({
        ...(projectLocation ? { projectLocation } : {}),
        absolutePath: target.skill.absolutePath,
      })
      .then((detail) => {
        if (!active) return;
        setContent(detail.content);
        setName(detail.name);
        setDescription(detail.description);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err, "Couldn't read the skill."));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target, projectLocation]);

  function changeName(value: string) {
    setName(value);
    if (isCreate && !folderTouched.current) setFolderName(slugifySkillName(value));
  }

  const invalid = !folderName.trim() || (isCreate && !name.trim());

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      if (target.mode === "create") {
        await readBridge().createSkill({
          ...operationContext,
          scopeDir: target.scopeDir,
          folderName: folderName.trim(),
          name: name.trim(),
          description: description.trim(),
          ...(content.trim() ? { body: content } : {}),
        });
        toast.success(`Created skill “${name.trim()}”.`);
      } else {
        // Rename the folder first (if changed) so the write targets the new path.
        let absolutePath = target.skill.absolutePath;
        if (folderName.trim() && folderName.trim() !== target.skill.folderName) {
          const renamed = await readBridge().renameSkill({
            ...operationContext,
            absolutePath,
            nextFolderName: folderName.trim(),
          });
          absolutePath = renamed.absolutePath;
        }
        await readBridge().writeSkill({ ...operationContext, absolutePath, content });
        // Use the folder name, not the load-time frontmatter name — the user may
        // have just edited `name:` in the raw content.
        toast.success(`Saved “${folderName.trim() || target.skill.folderName}”.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the skill."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>
          {isCreate ? "New skill" : `Edit ${target.mode === "edit" ? target.skill.name : ""}`}
        </Modal.Heading>
        <p className="mt-1 text-xs text-muted">
          {isCreate
            ? `Creates a SKILL.md folder in ${target.scopeLabel}.`
            : "Edit the raw SKILL.md. Frontmatter (name/description) lives at the top."}
        </p>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-3 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <PixelLoader size="md" className="text-muted" />
          </div>
        ) : isCreate ? (
          <>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted">Name</Label>
                <Input
                  aria-label="Skill name"
                  placeholder="My skill"
                  value={name}
                  onChange={(e) => changeName(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted">Folder</Label>
                <Input
                  aria-label="Folder name"
                  placeholder="my-skill"
                  value={folderName}
                  onChange={(e) => {
                    folderTouched.current = true;
                    setFolderName(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted">Description</Label>
              <Input
                aria-label="Description"
                placeholder="Use when… (helps the agent decide when to load this skill)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted">Instructions (markdown)</Label>
              <TextArea
                aria-label="Skill body"
                placeholder={"# My skill\n\nWhat to do, step by step…"}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[220px] font-mono text-xs"
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted">Folder</Label>
              <Input
                aria-label="Folder name"
                placeholder="my-skill"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <p className="text-[11px] text-muted/70">
                Renaming changes the folder on disk. The name/description shown in lists comes from
                the SKILL.md frontmatter below.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted">SKILL.md</Label>
              <TextArea
                aria-label="SKILL.md content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[320px] font-mono text-xs"
              />
            </div>
          </>
        )}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="ghost" className="text-muted">
          Cancel
        </Button>
        <Button
          variant="tertiary"
          isDisabled={loading || busy || invalid}
          isPending={busy}
          onPress={() => void handleSubmit()}
        >
          {isCreate ? "Create skill" : "Save"}
        </Button>
      </Modal.Footer>
    </>
  );
}
