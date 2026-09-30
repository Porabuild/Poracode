import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight, CornerLeftUp, File, Folder, House, Loader2 } from "lucide-react";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { HOST_DRIVE_LIST_PATH, type BrowseHostDirectoryResult } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";

export function MobileHostFolderPicker(props: {
  readonly desktopId: string;
  readonly title: string;
  readonly initialPath?: string;
  readonly onClose: () => void;
  readonly onSelect: (absolutePath: string) => void;
}) {
  const { t } = useLingui();
  const browseHostDirectory = useRemoteServersStore((state) => state.browseHostDirectory);
  const [listing, setListing] = useState<BrowseHostDirectoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The browsed path is owned state: `loading` derives from the request
  // identity (current vs. settled path) instead of a flag set synchronously in
  // an effect. Navigations only set the request — from events and from the
  // initial-path adjustment below — while the effect fulfills it. The nonce
  // re-issues an identical path (retry after a failure would otherwise bail
  // out of the effect with no state change).
  const initialPath = props.initialPath ?? "";
  const [request, setRequest] = useState({ path: initialPath, nonce: 0 });
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const loading = settledPath !== request.path;

  const [prevInitialPath, setPrevInitialPath] = useState(initialPath);
  if (prevInitialPath !== initialPath) {
    setPrevInitialPath(initialPath);
    setRequest((current) => ({ ...current, path: initialPath }));
  }

  const desktopId = props.desktopId;
  useEffect(() => {
    const { path } = request;
    let cancelled = false;
    void browseHostDirectory(desktopId, path).then(
      (result) => {
        if (cancelled) return;
        setListing(result);
        setError(null);
        setSettledPath(path);
      },
      (browseError: unknown) => {
        if (cancelled) return;
        setError(friendlyError(browseError));
        setSettledPath(path);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [browseHostDirectory, desktopId, request]);
  const browse = (path: string) => setRequest((current) => ({ ...current, path }));
  const retry = () => setRequest((current) => ({ ...current, nonce: current.nonce + 1 }));

  const directories = listing?.entries.filter((entry) => entry.type === "directory") ?? [];
  const files = listing?.entries.filter((entry) => entry.type === "file") ?? [];
  const isDriveList = listing?.path === HOST_DRIVE_LIST_PATH;

  return (
    <BottomSheet label={props.title} onClose={props.onClose}>
      <div className="m-sheet-head">
        <span className="truncate">{props.title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-default-50 p-1">
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted disabled:opacity-40"
            aria-label={t`Up one level`}
            disabled={!listing?.parentPath}
            onClick={() => listing?.parentPath && browse(listing.parentPath)}
          >
            <CornerLeftUp className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted"
            aria-label={t`Home folder`}
            onClick={() => listing && browse(listing.homePath)}
          >
            <House className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted">
            {isDriveList ? t`Drives` : (listing?.path ?? t`…`)}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-muted">
              <Loader2 className="size-4 animate-spin" />
              <Trans>Loading…</Trans>
            </div>
          ) : error ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center text-xs text-danger">
              <p>{error}</p>
              <Button size="sm" variant="secondary" onPress={retry}>
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : directories.length === 0 && files.length === 0 ? (
            <p className="flex min-h-40 items-center justify-center text-xs text-muted">
              <Trans>This folder is empty.</Trans>
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {directories.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="m-sheet-action"
                  onClick={() => browse(entry.path)}
                >
                  <Folder className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              ))}
              {files.map((entry) => (
                <div key={entry.path} className="m-sheet-action text-muted" data-static="true">
                  <File className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </div>
              ))}
              {listing?.truncated ? (
                <p className="px-3 py-2 text-xs text-muted">
                  <Trans>Showing the first 4,000 entries.</Trans>
                </p>
              ) : null}
            </div>
          )}
        </div>

        <Button
          fullWidth
          variant="tertiary"
          className="!rounded-2xl"
          isDisabled={!listing?.path || isDriveList}
          onPress={() => {
            if (!listing?.path || isDriveList) return;
            props.onSelect(listing.path);
            props.onClose();
          }}
        >
          <Folder className="size-4" />
          <Trans>Use this folder</Trans>
        </Button>
      </div>
    </BottomSheet>
  );
}
