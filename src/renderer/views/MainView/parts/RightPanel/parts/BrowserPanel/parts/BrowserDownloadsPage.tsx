import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Archive,
  Download,
  ExternalLink,
  File,
  FolderOpen,
  Pause,
  Play,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { Input } from "@/renderer/components/common";
import { useBrowserDownloadsStore } from "@/renderer/state/browserDownloadsStore";
import { formatBytes } from "@/shared/formatBytes";
import type { BrowserDownloadInfo } from "@/shared/ipc";

type DownloadAction = "pause" | "resume" | "cancel" | "remove" | "open" | "show-in-folder";

export function BrowserDownloadsPage() {
  const { t } = useLingui();
  const downloads = useBrowserDownloadsStore((state) => state.downloads);
  const setDownloads = useBrowserDownloadsStore((state) => state.setDownloads);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    readBridge()
      .browserGetDownloads()
      .then((items) => {
        if (!cancelled) setDownloads(items);
      })
      .catch(() => {
        if (!cancelled) toast.danger(t`Unable to load downloads.`);
      });
    return () => {
      cancelled = true;
    };
  }, [setDownloads, t]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleDownloads = normalizedQuery
    ? downloads.filter((download) => {
        const source = downloadSource(download.url).toLowerCase();
        return (
          download.filename.toLowerCase().includes(normalizedQuery) ||
          source.includes(normalizedQuery) ||
          download.url.toLowerCase().includes(normalizedQuery)
        );
      })
    : downloads;

  async function runAction(download: BrowserDownloadInfo, action: DownloadAction) {
    setBusyIds((current) => new Set(current).add(download.id));
    try {
      await readBridge().browserDownloadAction({ id: download.id, action });
    } catch {
      toast.danger(t`Unable to update the download.`);
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(download.id);
        return next;
      });
    }
  }

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden bg-[var(--content-background)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-secondary px-5 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-surface-tertiary text-foreground">
          <Download className="size-4.5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          <Trans>Download history</Trans>
        </h1>
        <div className="ml-auto w-[min(260px,40%)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t`Search downloads`}
              placeholder={t`Search downloads`}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="pl-8 text-xs"
            />
          </div>
        </div>
      </header>

      {visibleDownloads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="relative h-20 w-24 text-muted/70" aria-hidden>
            <File className="absolute left-8 top-0 size-9 -rotate-6" />
            <Archive className="absolute bottom-0 left-4 size-10 -rotate-12" />
            <Download className="absolute bottom-1 right-3 size-10 rotate-12" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {downloads.length === 0 ? (
                <Trans>Files you download appear here</Trans>
              ) : (
                <Trans>No downloads match your search</Trans>
              )}
            </p>
            {downloads.length === 0 ? (
              <p className="mt-1 text-xs text-muted">
                <Trans>Downloads from the built-in browser are saved in this history.</Trans>
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {visibleDownloads.map((download) => (
              <DownloadRow
                key={download.id}
                download={download}
                busy={busyIds.has(download.id)}
                onAction={(action) => void runAction(download, action)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadRow(props: {
  download: BrowserDownloadInfo;
  busy: boolean;
  onAction: (action: DownloadAction) => void;
}) {
  const { t } = useLingui();
  const { download } = props;
  const progress =
    download.totalBytes > 0
      ? Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100))
      : download.state === "completed"
        ? 100
        : null;
  const transferLabel =
    download.totalBytes > 0
      ? `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)}`
      : formatBytes(download.receivedBytes);
  const indeterminate = progress === null && download.state === "progressing";

  return (
    <article className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary text-muted">
          <File className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={download.filename}>
            {download.filename}
          </p>
          <p className="truncate text-[11px] text-muted" title={download.url}>
            {downloadSource(download.url)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {download.state === "progressing" || download.state === "paused" ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={props.busy}
              aria-label={download.state === "paused" ? t`Resume download` : t`Pause download`}
              onPress={() => props.onAction(download.state === "paused" ? "resume" : "pause")}
            >
              {download.state === "paused" ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
            </Button>
          ) : null}
          {download.state === "interrupted" && download.canResume ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={props.busy}
              aria-label={t`Resume download`}
              onPress={() => props.onAction("resume")}
            >
              <Play className="size-3.5" />
            </Button>
          ) : null}
          {download.state === "progressing" || download.state === "paused" ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={props.busy}
              aria-label={t`Cancel download`}
              onPress={() => props.onAction("cancel")}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
          {download.state === "completed" ? (
            <>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                isDisabled={props.busy}
                aria-label={t`Open downloaded file`}
                onPress={() => props.onAction("open")}
              >
                <ExternalLink className="size-3.5" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                isDisabled={props.busy}
                aria-label={t`Show in folder`}
                onPress={() => props.onAction("show-in-folder")}
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </>
          ) : null}
          {download.state === "completed" ||
          download.state === "cancelled" ||
          download.state === "interrupted" ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              isDisabled={props.busy}
              aria-label={t`Remove from download history`}
              onPress={() => props.onAction("remove")}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <div
          role="progressbar"
          aria-label={t`Download progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(progress !== null ? { "aria-valuenow": progress } : {})}
          className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary"
        >
          <div
            className={`h-full rounded-full bg-accent transition-[width] ${indeterminate ? "w-1/3 animate-pulse" : progress === null ? "w-0" : ""}`}
            {...(progress !== null ? { style: { width: `${progress}%` } } : {})}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted">
          <DownloadStateLabel download={download} />
          <span className="tabular-nums">{transferLabel}</span>
        </div>
      </div>
    </article>
  );
}

function DownloadStateLabel(props: { download: BrowserDownloadInfo }) {
  switch (props.download.state) {
    case "progressing":
      return <Trans>Downloading</Trans>;
    case "paused":
      return <Trans>Paused</Trans>;
    case "completed":
      return <Trans>Completed</Trans>;
    case "cancelled":
      return <Trans>Cancelled</Trans>;
    case "interrupted":
      return props.download.canResume ? <Trans>Interrupted</Trans> : <Trans>Download failed</Trans>;
  }
}

function downloadSource(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
