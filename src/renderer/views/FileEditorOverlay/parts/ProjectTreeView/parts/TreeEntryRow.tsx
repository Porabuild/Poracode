import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight, Copy, FilePlus, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { ProjectTreeEntry } from "@/shared/contracts";
import { ContextMenu, PixelLoader } from "@/renderer/components/common";
import { getEntryIconUrl } from "@/renderer/components/common/fileIcons";
import { useIsTabActive, useIsPathOpenInTab } from "@/renderer/state/fileEditorSelectors";
import {
  useDirectoryEntries,
  useIsDropTarget,
  useIsPathExpanded,
  useIsPathLoading,
  useProjectTreeStore,
} from "@/renderer/state/projectTreeStore";
import { InlineNameInput } from "./InlineNameInput";
import { InlineDraftRow } from "./InlineDraftRow";
import type { TreeDraftState } from "./useProjectTree";

const COMPOSER_FILE_DRAG_TYPE = "application/poracode-composer-file";

export function TreeEntryRow(props: {
  entry: ProjectTreeEntry;
  depth: number;
  draft: TreeDraftState | null;
  setDraft: React.Dispatch<React.SetStateAction<TreeDraftState | null>>;
  onSelectFile: (path: string) => void;
  onPinFile?: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onEntryAction: (entry: ProjectTreeEntry, action: string) => void;
  onMovePath: (sourcePath: string, nextParentPath: string) => Promise<void>;
  onHandleRename: (path: string, nextName: string) => Promise<void>;
  onHandleCreate: (parentPath: string, type: "file" | "directory", value: string) => Promise<void>;
  renderChildren?: boolean;
}) {
  const { t } = useLingui();
  const { entry, depth, draft, setDraft } = props;
  const isDirectory = entry.type === "directory";
  const isSelected = useIsTabActive(entry.path);
  const isOpenInTabRaw = useIsPathOpenInTab(entry.path);
  const isOpenInTab = !isSelected && isOpenInTabRaw;
  const isExpanded = useIsPathExpanded(entry.path);
  const isLoadingChildren = useIsPathLoading(entry.path);
  const isDropTarget = useIsDropTarget(entry.path);
  const isRenameDraft = draft?.mode === "rename" && draft.path === entry.path;
  const iconUrl = getEntryIconUrl(entry.name, isDirectory);

  return (
    <div>
      <ContextMenu
        items={[
          {
            id: "reveal",
            label: t`Reveal in File Explorer`,
            icon: <FolderOpen className="size-3.5" />,
          },
          ...(isDirectory
            ? [
                {
                  id: "new-file",
                  label: t`New File`,
                  icon: <FilePlus className="size-3.5" />,
                },
                {
                  id: "new-folder",
                  label: t`New Folder`,
                  icon: <FolderPlus className="size-3.5" />,
                },
              ]
            : []),
          {
            id: "copy-path",
            label: t`Copy Path`,
            icon: <Copy className="size-3.5" />,
          },
          {
            id: "copy-relative-path",
            label: t`Copy Relative Path`,
            icon: <Copy className="size-3.5" />,
          },
          {
            id: "rename",
            label: t`Rename`,
            icon: <Pencil className="size-3.5" />,
          },
          {
            id: "delete",
            label: t`Delete`,
            icon: <Trash2 className="size-3.5" />,
            variant: "danger",
          },
        ]}
        onAction={(action) => props.onEntryAction(entry, action)}
      >
        <div
          role="button"
          tabIndex={0}
          draggable
          className={`group flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm text-muted transition-colors ${
            isSelected
              ? "bg-[var(--row-active)] text-foreground"
              : isOpenInTab
                ? "bg-[var(--row-hover)] text-foreground hover:bg-[var(--row-hover)]"
                : "hover:bg-[var(--row-hover)] hover:text-foreground"
          } ${isDropTarget ? "ring-1 ring-accent/40" : ""}`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => {
            if (isDirectory) {
              void props.onToggleDirectory(entry.path);
            } else {
              void props.onSelectFile(entry.path);
            }
          }}
          onDoubleClick={() => {
            if (!isDirectory) {
              props.onPinFile?.(entry.path);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (isDirectory) {
              void props.onToggleDirectory(entry.path);
            } else {
              void props.onSelectFile(entry.path);
            }
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(
              "application/poracode-project-tree",
              JSON.stringify({ path: entry.path, type: entry.type }),
            );
            if (!isDirectory) {
              event.dataTransfer.setData(
                COMPOSER_FILE_DRAG_TYPE,
                JSON.stringify({ path: entry.path, type: entry.type }),
              );
            }
            event.dataTransfer.effectAllowed = isDirectory ? "move" : "copyMove";
          }}
          onDragOver={(event) => {
            if (isDirectory) {
              event.preventDefault();
              useProjectTreeStore.getState().setDropTargetPath(entry.path);
            }
          }}
          onDragLeave={() => {
            if (useProjectTreeStore.getState().dropTargetPath === entry.path) {
              useProjectTreeStore.getState().setDropTargetPath(null);
            }
          }}
          onDrop={(event) => {
            if (!isDirectory) return;
            event.preventDefault();
            useProjectTreeStore.getState().setDropTargetPath(null);
            const payload = event.dataTransfer.getData("application/poracode-project-tree");
            if (!payload) return;
            try {
              const { path } = JSON.parse(payload) as { path: string };
              void props
                .onMovePath(path, entry.path)
                .catch((error) =>
                  toast.danger(error instanceof Error ? error.message : String(error)),
                );
            } catch {
              // ignore malformed drops
            }
          }}
        >
          <div className="flex size-4 shrink-0 items-center justify-center">
            {isDirectory ? (
              entry.hasChildren ? (
                <ChevronRight
                  className={`size-3.5 text-muted/70 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              ) : null
            ) : null}
          </div>
          <img alt="" aria-hidden className="size-4 shrink-0" src={iconUrl} />
          {isRenameDraft ? (
            <InlineNameInput
              value={draft?.value ?? ""}
              onChange={(value) => setDraft((state) => (state ? { ...state, value } : state))}
              onCancel={() => setDraft(null)}
              onCommit={(value) => {
                void props
                  .onHandleRename(entry.path, value)
                  .catch((error) =>
                    toast.danger(error instanceof Error ? error.message : String(error)),
                  );
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          )}
        </div>
      </ContextMenu>

      {props.renderChildren !== false && isDirectory && isExpanded ? (
        <TreeChildren
          parentPath={entry.path}
          depth={depth + 1}
          isLoading={isLoadingChildren}
          draft={draft}
          setDraft={setDraft}
          onSelectFile={props.onSelectFile}
          {...(props.onPinFile ? { onPinFile: props.onPinFile } : {})}
          onToggleDirectory={props.onToggleDirectory}
          onEntryAction={props.onEntryAction}
          onMovePath={props.onMovePath}
          onHandleRename={props.onHandleRename}
          onHandleCreate={props.onHandleCreate}
        />
      ) : null}
    </div>
  );
}

function TreeChildren(props: {
  parentPath: string;
  depth: number;
  isLoading: boolean;
  draft: TreeDraftState | null;
  setDraft: React.Dispatch<React.SetStateAction<TreeDraftState | null>>;
  onSelectFile: (path: string) => void;
  onPinFile?: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onEntryAction: (entry: ProjectTreeEntry, action: string) => void;
  onMovePath: (sourcePath: string, nextParentPath: string) => Promise<void>;
  onHandleRename: (path: string, nextName: string) => Promise<void>;
  onHandleCreate: (parentPath: string, type: "file" | "directory", value: string) => Promise<void>;
}) {
  const { parentPath, depth, isLoading, draft, setDraft } = props;
  const entries = useDirectoryEntries(parentPath);
  const hasDraftHere = draft?.parentPath === parentPath && draft.mode === "create";

  return (
    <div>
      {hasDraftHere ? (
        <InlineDraftRow
          depth={depth}
          type={draft.type}
          value={draft.value}
          onChange={(value) => setDraft((state) => (state ? { ...state, value } : state))}
          onCancel={() => setDraft(null)}
          onCommit={(value) => {
            void props
              .onHandleCreate(parentPath, draft.type, value)
              .catch((error) =>
                toast.danger(error instanceof Error ? error.message : String(error)),
              );
          }}
        />
      ) : null}
      {isLoading && entries.length === 0 ? (
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-muted"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <PixelLoader size="xs" />
          <Trans>Loading…</Trans>
        </div>
      ) : (
        entries.map((child) => (
          <TreeEntryRow
            key={child.path}
            entry={child}
            depth={depth}
            draft={draft}
            setDraft={setDraft}
            onSelectFile={props.onSelectFile}
            {...(props.onPinFile ? { onPinFile: props.onPinFile } : {})}
            onToggleDirectory={props.onToggleDirectory}
            onEntryAction={props.onEntryAction}
            onMovePath={props.onMovePath}
            onHandleRename={props.onHandleRename}
            onHandleCreate={props.onHandleCreate}
          />
        ))
      )}
    </div>
  );
}

export { TreeChildren };
