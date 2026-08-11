import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ProjectLocation, SkillEntry } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { Button, PixelLoader } from "@/renderer/components/common";
import { MarkdownPreview } from "@/renderer/views/FileEditorOverlay/parts/MarkdownPreview";

function skillMarkdownBody(content: string): string {
  return content.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, "").trimStart();
}

export function SkillViewModal(props: {
  skill: SkillEntry;
  displayName: string;
  projectLocation?: ProjectLocation;
  wslDistro?: string;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [content, setContent] = useState<string>();
  const [error, setError] = useState(false);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    let active = true;
    setContent(undefined);
    setError(false);
    setRaw(false);
    const bridge = readBridge();
    const projectLocation: ProjectLocation =
      props.projectLocation ??
      (props.wslDistro
        ? {
            kind: "wsl",
            distro: props.wslDistro,
            linuxPath: "/",
            uncPath: toWslUncPath(props.wslDistro, "/"),
          }
        : bridge.platform === "win32"
          ? { kind: "windows", path: props.skill.absolutePath }
          : { kind: "posix", path: props.skill.absolutePath });
    void bridge
      .readExternalFile({
        projectLocation,
        absolutePath: props.skill.skillFilePath,
      })
      .then(
        (result) => {
          if (!active) return;
          if (result.status === "ready" && result.content !== undefined) {
            setContent(result.content);
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
  }, [props.projectLocation, props.skill.absolutePath, props.skill.skillFilePath, props.wslDistro]);

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
            ) : raw ? (
              <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-foreground">
                {content}
              </pre>
            ) : (
              <MarkdownPreview compact content={skillMarkdownBody(content)} />
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={() => setRaw((current) => !current)}>
              {raw ? <Trans>View rendered</Trans> : <Trans>View raw</Trans>}
            </Button>
            <Button slot="close" variant="ghost" aria-label={t`Close`}>
              <Trans>Close</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
