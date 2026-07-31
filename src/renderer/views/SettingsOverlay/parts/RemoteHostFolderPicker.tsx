import { useEffect, useEffectEvent, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight, CornerLeftUp, File, Folder, House, Loader2, Server } from "lucide-react";
import { HOST_DRIVE_LIST_PATH, type BrowseHostDirectoryResult } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export function RemoteHostFolderPicker(props: {
  readonly desktopId: string;
  readonly title: string;
  readonly initialPath?: string;
  readonly onClose: () => void;
  readonly onSelect: (absolutePath: string) => void;
}) {
  const { t } = useLingui();
  const browseHostDirectory = useRemoteServersStore((state) => state.browseHostDirectory);
  const [listing, setListing] = useState<BrowseHostDirectoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function browse(path: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await browseHostDirectory(props.desktopId, path);
      setListing(result);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }
  const browseInitialPath = useEffectEvent(browse);

  useEffect(() => {
    void browseInitialPath(props.initialPath ?? "");
  }, [props.initialPath]);

  const directories = listing?.entries.filter((entry) => entry.type === "directory") ?? [];
  const files = listing?.entries.filter((entry) => entry.type === "file") ?? [];
  const isDriveList = listing?.path === HOST_DRIVE_LIST_PATH;

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="sm:max-w-[640px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-default text-foreground">
              <Server className="size-5" />
            </Modal.Icon>
            <Modal.Heading>{props.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="min-h-[360px] p-4">
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-1 rounded-xl bg-default-50 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label={t`Up one level`}
                  isDisabled={!listing?.parentPath}
                  onPress={() => listing?.parentPath && void browse(listing.parentPath)}
                >
                  <CornerLeftUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label={t`Home folder`}
                  onPress={() => listing && void browse(listing.homePath)}
                >
                  <House className="size-4" />
                </Button>
                <span
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm text-muted"
                  {...(!isDriveList && listing?.path ? { title: listing.path } : {})}
                >
                  {isDriveList ? t`Drives` : (listing?.path ?? t`…`)}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" />
                    <Trans>Loading…</Trans>
                  </div>
                ) : error ? (
                  <div className="flex h-40 items-center justify-center px-4 text-sm text-danger">
                    {error}
                  </div>
                ) : directories.length === 0 && files.length === 0 ? (
                  <p className="flex h-40 items-center justify-center text-sm text-muted">
                    <Trans>This folder is empty.</Trans>
                  </p>
                ) : (
                  <div className="space-y-1">
                    {directories.map((entry) => (
                      <Button
                        key={entry.path}
                        variant="ghost"
                        fullWidth
                        className="group h-auto justify-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-normal"
                        onPress={() => void browse(entry.path)}
                      >
                        <Folder className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </Button>
                    ))}
                    {files.map((entry) => (
                      <div
                        key={entry.path}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted"
                      >
                        <File className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      </div>
                    ))}
                    {listing?.truncated ? (
                      <p className="px-2.5 py-2 text-xs text-muted">
                        <Trans>Showing the first 4,000 entries.</Trans>
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" className="text-muted" onPress={props.onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
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
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
