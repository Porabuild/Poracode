import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button, toast } from "@heroui/react";
import { Download } from "lucide-react";
import { friendlyError } from "@/shared/messages";
import {
  chatFileLocalPath,
  chatFileName,
  isChatFileSource,
  type ChatFileSource,
} from "@/shared/chatFile";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { downloadChatFile } from "@/renderer/components/media/fileMediaSource";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import type { ProjectLocation } from "@/shared/contracts";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";

/**
 * Compact download card for a local artifact reference in chat. Stays
 * inline-safe (span wrappers) so it can sit inside a paragraph; the download
 * mints a ticket only on explicit click and always reads from the owning host.
 */
export function MarkdownFile(props: ChatFileSource) {
  const actions = useChatPaneActions();
  const location = actions?.mediaLocation ?? actions?.projectLocation ?? null;
  // Owner + src own the leaf so a stale async mint can never download for a
  // path or host this card no longer shows.
  return (
    <FileDownloadCard
      key={`${JSON.stringify(location)}\0${props.src}`}
      location={location}
      {...props}
    />
  );
}

function FileDownloadCard({
  src,
  name,
  location,
}: ChatFileSource & { location: ProjectLocation | null }) {
  const { t } = useLingui();
  const webUrl = /^https?:\/\//iu.test(src);
  const path = webUrl ? "" : (chatFileLocalPath(src) ?? "");
  const fileName = chatFileName(webUrl ? src : path || src, name);
  const valid = webUrl || (isChatFileSource(src) && path.length > 0);
  const canDownload = webUrl || location !== null;
  const actions = useChatPaneActions();
  // Documents the editor already previews keep their open action on the name;
  // archives/installers never try the text editor.
  const previewable = /\.(txt|csv|tsv|pdf)$/iu.test(fileName);
  const openPreview =
    !webUrl && previewable && path && actions?.openProjectRelativePath
      ? () => {
          void actions
            .openProjectRelativePath?.(path, undefined)
            .catch((error: unknown) => toast.danger(friendlyError(error)));
        }
      : null;
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const download = () => {
    if (pending || !valid || !canDownload) return;
    if (webUrl) {
      // Canonical HTTP file references keep safe external-link opening rather
      // than fetching arbitrary URLs through the host.
      openExternalWithFeedback(src);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    downloadChatFile(location!, path, controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) toast.danger(t`Unable to download the file.`);
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setPending(false);
      });
  };

  return (
    <span
      className="poracode-chat-file not-prose my-1 inline-flex max-w-full min-w-0 items-center gap-2 rounded-[0.375rem] border border-transparent bg-foreground/[0.08] px-2.5 py-1.5 align-middle hover:bg-foreground/[0.11] dark:bg-foreground/5 dark:hover:bg-foreground/[0.07]"
      data-testid="chat-file"
    >
      <img src={getEntryIconUrl(fileName, false)} alt="" className="size-4 shrink-0" aria-hidden />
      {openPreview ? (
        <Button
          variant="ghost"
          aria-label={fileName}
          className="h-auto min-h-0 min-w-0 max-w-full shrink rounded border-0 bg-transparent p-0 font-mono text-[0.875em] font-normal text-foreground underline-offset-2 hover:underline"
          onPress={openPreview}
        >
          <span className="truncate" title={path}>
            {fileName}
          </span>
        </Button>
      ) : (
        <span
          className="min-w-0 truncate font-mono text-[0.875em] text-foreground"
          title={webUrl ? src : path || fileName}
        >
          {fileName}
        </span>
      )}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        className="size-6 min-w-6 shrink-0 rounded-[0.25rem]"
        aria-label={t`Download ${fileName}`}
        isDisabled={!valid || !canDownload}
        isPending={pending}
        onPress={download}
      >
        {({ isPending: spinning }) =>
          spinning ? <PixelLoader size="xxs" /> : <Download className="size-3.5" aria-hidden />
        }
      </Button>
    </span>
  );
}
