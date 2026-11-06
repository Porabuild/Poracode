import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import { Download } from "lucide-react";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { ResponsiveContextMenu } from "@/renderer/components/common/ResponsiveContextMenu";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { chatFileLocalPath, isChatDownloadPath } from "@/shared/chatFile";
import { fileMediaType } from "@/shared/fileMedia";
import { friendlyError } from "@/shared/messages";
import { getBasename } from "@/shared/pathUtils";
import { useChatPaneActions, type ChatPaneActions } from "../../chatPaneActionsContext";

interface InlineFilePathChipProps {
  path: string;
  name?: string;
  mimeType?: string;
  line?: number | undefined;
  endLine?: number | undefined;
  onOpen?: ((path: string, lineNumber?: number) => Promise<void> | void) | undefined;
  /** Display-only span, for rows that already sit inside a button. */
  isStatic?: boolean;
}

/**
 * Inline chip rendered inside chat markdown for `path[:line]` references.
 * Vertically centered with surrounding prose (em-based sizing) so it reads
 * inline without clipping descenders. Mirrors the visual language of
 * `.poracode-mention-chip` used in the composer.
 *
 * When `onOpen` rejects (e.g. a bare basename that couldn't be resolved to a
 * real project file), the chip switches to an inert visual — same badge but
 * no hover effect and no click handler — so the user sees the reference
 * without a broken interaction.
 */
export function InlineFilePathChip(props: InlineFilePathChipProps) {
  const actions = useChatPaneActions();
  const location = actions?.mediaLocation ?? actions?.projectLocation ?? null;
  return (
    <FilePathChip key={`${JSON.stringify(location)}\0${props.path}`} {...props} actions={actions} />
  );
}

function FilePathChip({
  path,
  name,
  mimeType,
  line,
  endLine,
  onOpen,
  isStatic = false,
  actions,
}: InlineFilePathChipProps & { actions: ChatPaneActions | null }) {
  const { t } = useLingui();
  const location = actions?.mediaLocation ?? actions?.projectLocation ?? null;
  const [inert, setInert] = useState(false);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const basename = name?.trim() || getBasename(path);
  const iconUrl = getEntryIconUrl(basename, false);
  const webUrl = /^https?:\/\//iu.test(path);
  const localPath = chatFileLocalPath(path);
  const canDownload = webUrl || (localPath !== undefined && location !== null);
  const downloadOnClick =
    isChatDownloadPath(path, mimeType) &&
    !/\.(txt|csv|tsv|pdf)$/iu.test(path) &&
    !fileMediaType(path);

  const download = () => {
    if (!canDownload || abortRef.current) return;
    if (webUrl) {
      openExternalWithFeedback(path);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    void import("@/renderer/components/media/fileMediaSource")
      .then(async ({ downloadChatFile }) => {
        let downloadPath = localPath!;
        if (actions?.projectLocation && !downloadOnClick && !/[\\/]/u.test(downloadPath)) {
          const { resolveBareBasename } = await import("../../chatPaneFileActions");
          downloadPath = await resolveBareBasename(
            downloadPath,
            location!,
            actions.projectRootNames,
          );
        }
        if (!controller.signal.aborted)
          return downloadChatFile(location!, downloadPath, controller.signal);
        return undefined;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          toast.danger(t`Unable to download the file.`, { description: friendlyError(error) });
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setPending(false);
      });
  };
  const lineLabel =
    line !== undefined ? `${line}${endLine !== undefined ? `-${endLine}` : ""}` : "";
  const title = line !== undefined ? `${path}:${lineLabel}` : path;

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (downloadOnClick) {
      download();
      return;
    }
    if (webUrl) {
      openExternalWithFeedback(path);
      return;
    }
    if (inert || !onOpen) return;
    const result = onOpen(path, line);
    if (result && typeof result.catch === "function") {
      result.catch((error: unknown) => {
        setInert(true);
        toast.danger(friendlyError(error));
      });
    }
  };

  const content = (
    <>
      {pending ? (
        <span className="poracode-inline-path-chip__icon inline-flex items-center justify-center">
          <PixelLoader size="xxs" />
        </span>
      ) : (
        <img className="poracode-inline-path-chip__icon" src={iconUrl} alt="" draggable={false} />
      )}
      <span className="poracode-inline-path-chip__name">{basename}</span>
      {line !== undefined ? (
        <span className="poracode-inline-path-chip__line">{`· L${lineLabel}`}</span>
      ) : null}
      {downloadOnClick && !isStatic ? (
        <Download className="poracode-inline-path-chip__icon" aria-hidden />
      ) : null}
    </>
  );

  if (isStatic) {
    return (
      <span className="poracode-inline-path-chip poracode-inline-path-chip--static" title={title}>
        {content}
      </span>
    );
  }

  return (
    <ResponsiveContextMenu
      as="span"
      label={basename}
      items={[
        {
          id: "download",
          label: t`Download`,
          icon: <Download className="size-4" />,
          isDisabled: !canDownload || pending,
        },
      ]}
      onAction={download}
    >
      <button
        type="button"
        className={`poracode-inline-path-chip${inert ? " poracode-inline-path-chip--inert" : ""}`}
        title={title}
        disabled={(inert || downloadOnClick) && !canDownload}
        aria-disabled={inert || (downloadOnClick && !canDownload)}
        aria-busy={pending}
        onClick={handleClick}
      >
        {content}
      </button>
    </ResponsiveContextMenu>
  );
}
