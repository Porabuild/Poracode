import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight, CornerLeftUp, File, Folder, House, Loader2 } from "lucide-react";
import { HOST_DRIVE_LIST_PATH, type HostDirectoryEntry } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";

interface Listing {
  path: string;
  parentPath: string | null;
  homePath: string;
  entries: readonly HostDirectoryEntry[];
  truncated: boolean;
}

/**
 * A file-explorer drawer for picking a folder on the paired host — the mobile
 * stand-in for the desktop's native folder dialog. Navigates the host
 * filesystem via the `browseHostDirectory` bridge call (gated by the
 * `projects:manage` scope) and returns the chosen directory's absolute path.
 */
export function HostFolderPicker(props: {
  /** Drawer heading, e.g. "Choose a folder". */
  readonly title: string;
  /** Where to start browsing; empty string → the host's home directory. */
  readonly initialPath?: string;
  readonly onClose: () => void;
  readonly onSelect: (absolutePath: string) => void;
}) {
  const { t } = useLingui();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The browsed path is owned state: `loading` derives from the request
  // identity (current vs. settled path) instead of a flag set synchronously in
  // an effect. Navigations only set the path — from events and from the
  // initial-path adjustment below — while the effect fulfills the request.
  const initialPath = props.initialPath ?? "";
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const loading = settledPath !== currentPath;

  const [prevInitialPath, setPrevInitialPath] = useState(initialPath);
  if (prevInitialPath !== initialPath) {
    setPrevInitialPath(initialPath);
    setCurrentPath(initialPath);
  }

  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .browseHostDirectory({ path: currentPath })
      .then((result) => {
        if (cancelled) return;
        setListing(result);
        setError(null);
        setSettledPath(currentPath);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(friendlyError(err));
        setSettledPath(currentPath);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);
  const browse = (path: string) => setCurrentPath(path);

  // Close on Escape, matching the composer drawers.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  const directories = listing?.entries.filter((entry) => entry.type === "directory") ?? [];
  const files = listing?.entries.filter((entry) => entry.type === "file") ?? [];
  // The synthetic drive list (Windows) is a navigation stop, not a folder.
  const isDriveList = listing?.path === HOST_DRIVE_LIST_PATH;

  // Portaled to <body> like BottomSheet: the trigger lives inside `.m-main`,
  // whose view-transition-name forces a stacking context, so an inline backdrop
  // would slide under the tab bar on tab routes.
  return createPortal(
    <div className="m-sheet-backdrop">
      <button
        type="button"
        className="m-sheet-scrim"
        aria-label={t`Close`}
        onClick={props.onClose}
      />
      <div className="m-picker" role="dialog" aria-label={props.title}>
        <div className="m-sheet-grabber" aria-hidden="true">
          <span />
        </div>
        <div className="m-sheet-head">
          <span className="truncate">{props.title}</span>
        </div>

        <div className="m-picker__bar">
          <button
            type="button"
            className="m-picker__nav"
            aria-label={t`Up one level`}
            disabled={!listing?.parentPath}
            onClick={() => listing?.parentPath && browse(listing.parentPath)}
          >
            <CornerLeftUp className="size-4" />
          </button>
          <button
            type="button"
            className="m-picker__nav"
            aria-label={t`Home folder`}
            onClick={() => listing && browse(listing.homePath)}
          >
            <House className="size-4" />
          </button>
          <span className="m-picker__path" title={isDriveList ? undefined : listing?.path}>
            {isDriveList ? t`Drives` : (listing?.path ?? "…")}
          </span>
        </div>

        <div className="m-picker__list">
          {loading ? (
            <div className="m-files-status">
              <Loader2 className="size-4 m-spin" />
              <Trans>Loading…</Trans>
            </div>
          ) : error ? (
            <div className="m-files-status">{error}</div>
          ) : directories.length === 0 && files.length === 0 ? (
            <p className="m-files-empty">
              <Trans>This folder is empty.</Trans>
            </p>
          ) : (
            <>
              {directories.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="m-picker__row"
                  onClick={() => browse(entry.path)}
                >
                  <Folder className="size-4 shrink-0 text-accent" />
                  <span className="m-picker__row-name">{entry.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              ))}
              {/* Files are shown for orientation but aren't selectable — this is a
                  folder picker. */}
              {files.map((entry) => (
                <div key={entry.path} className="m-picker__row m-picker__row--file">
                  <File className="size-4 shrink-0 text-muted" />
                  <span className="m-picker__row-name">{entry.name}</span>
                </div>
              ))}
              {listing?.truncated ? (
                <p className="m-files-empty">
                  <Trans>Showing the first 4,000 entries.</Trans>
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="m-picker__foot">
          <Button
            className="w-full text-foreground"
            size="sm"
            variant="tertiary"
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
      </div>
    </div>,
    document.body,
  );
}
