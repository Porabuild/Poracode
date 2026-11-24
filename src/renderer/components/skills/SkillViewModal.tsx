import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectLocation, SkillEntry } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import {
  readExternalFileForHost,
  resolveSkillHostPlatform,
  writeExternalFileForHost,
} from "./skillHostBridge";
import { Button, PixelLoader } from "@/renderer/components/common";
import { MarkdownPreview } from "@/renderer/views/FileEditorOverlay/parts/MarkdownPreview";

function skillMarkdownBody(content: string): string {
  return content.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, "").trimStart();
}

function viewProjectLocation(
  skillPath: string,
  platform: string,
  projectLocation: ProjectLocation | undefined,
  wslDistro: string | undefined,
): ProjectLocation {
  if (projectLocation) return projectLocation;
  if (wslDistro) {
    return {
      kind: "wsl",
      distro: wslDistro,
      linuxPath: "/",
      uncPath: toWslUncPath(wslDistro, "/"),
    };
  }
  return platform === "win32"
    ? { kind: "windows", path: skillPath }
    : { kind: "posix", path: skillPath };
}

export function SkillViewModal(props: {
  skill: SkillEntry;
  displayName: string;
  projectLocation?: ProjectLocation;
  wslDistro?: string;
  connectionKey?: string;
  hostPlatform?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useLingui();
  const [content, setContent] = useState<string>();
  const [modifiedAtMs, setModifiedAtMs] = useState<number>();
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [raw, setRaw] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");

  // Reload when the viewed skill (or its source location) changes; the
  // content/error/raw reset happens during render, the file read stays in the
  // effect below and only settles through async callbacks.
  const skillContentKey = [
    props.connectionKey ?? "",
    props.skill.skillFilePath,
    props.skill.absolutePath,
    props.wslDistro ?? "",
    props.projectLocation ? JSON.stringify(props.projectLocation) : "",
  ].join("");
  const [prevSkillContentKey, setPrevSkillContentKey] = useState(skillContentKey);
  if (prevSkillContentKey !== skillContentKey) {
    setPrevSkillContentKey(skillContentKey);
    setContent(undefined);
    setModifiedAtMs(undefined);
    setError(false);
    setSaveError(false);
    setRaw(false);
    setEditing(false);
    setDraft("");
  }

  useEffect(() => {
    let active = true;
    const projectLocation = viewProjectLocation(
      props.skill.absolutePath,
      resolveSkillHostPlatform(props.hostPlatform),
      props.projectLocation,
      props.wslDistro,
    );
    void readExternalFileForHost(props.connectionKey, {
      projectLocation,
      absolutePath: props.skill.skillFilePath,
    }).then(
      (result) => {
        if (!active) return;
        if (result.status === "ready" && result.content !== undefined) {
          setContent(result.content);
          if (typeof result.modifiedAtMs === "number") setModifiedAtMs(result.modifiedAtMs);
        } else {
          setError(true);
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [
    props.connectionKey,
    props.hostPlatform,
    props.projectLocation,
    props.skill.absolutePath,
    props.skill.skillFilePath,
    props.wslDistro,
  ]);

  async function save() {
    if (saving || content === undefined || modifiedAtMs === undefined) return;
    setSaving(true);
    try {
      const result = await writeExternalFileForHost(props.connectionKey, {
        projectLocation: viewProjectLocation(
          props.skill.absolutePath,
          resolveSkillHostPlatform(props.hostPlatform),
          props.projectLocation,
          props.wslDistro,
        ),
        absolutePath: props.skill.skillFilePath,
        content: draft,
        baseModifiedAtMs: modifiedAtMs,
      });
      setContent(draft);
      setModifiedAtMs(result.modifiedAtMs);
      setEditing(false);
      setSaveError(false);
      props.onSaved?.();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container placement="center" scroll="inside" size="lg">
        <Modal.Dialog className="sm:max-w-3xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{props.displayName}</Modal.Heading>
            <p className="mt-1 truncate font-mono text-xs text-muted">
              {props.skill.skillFilePath}
            </p>
          </Modal.Header>
          <Modal.Body className="h-[min(36rem,70vh)] min-h-80 p-0">
            {error ? (
              <div className="flex min-h-80 items-center justify-center px-6 text-sm text-danger">
                <Trans>Couldn't load the skill.</Trans>
              </div>
            ) : content === undefined ? (
              <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted">
                <PixelLoader size="xs" />
                <Trans>Loading skill…</Trans>
              </div>
            ) : editing ? (
              <textarea
                aria-label={props.displayName}
                className="h-full w-full resize-none bg-transparent p-5 font-mono text-xs leading-5 text-foreground outline-none"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : raw ? (
              <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-foreground">
                {content}
              </pre>
            ) : (
              <MarkdownPreview compact content={skillMarkdownBody(content)} />
            )}
          </Modal.Body>
          <Modal.Footer>
            {saveError ? (
              <p className="mr-auto text-xs text-danger">
                <Trans>Couldn't update the skill.</Trans>
              </p>
            ) : null}
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  isDisabled={saving}
                  onPress={() => {
                    setSaveError(false);
                    setEditing(false);
                  }}
                >
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  variant="tertiary"
                  isDisabled={saving || modifiedAtMs === undefined}
                  onPress={() => void save()}
                >
                  <Trans>Save</Trans>
                </Button>
              </>
            ) : (
              <>
                {props.skill.mutable && content !== undefined ? (
                  <Button
                    variant="ghost"
                    onPress={() => {
                      setDraft(content);
                      setSaveError(false);
                      setEditing(true);
                    }}
                  >
                    <Trans>Edit</Trans>
                  </Button>
                ) : null}
                <Button variant="ghost" onPress={() => setRaw((current) => !current)}>
                  {raw ? <Trans>View rendered</Trans> : <Trans>View raw</Trans>}
                </Button>
              </>
            )}
            <Button slot="close" variant="ghost" aria-label={t`Close`}>
              <Trans>Close</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
