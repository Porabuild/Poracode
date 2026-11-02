import { useState } from "react";
import { toast } from "@heroui/react";
import { FileText, Images, ExternalLink } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadGalleryImage } from "./ChatPane/parts/items/threadGalleryImages";
import { DownsampledThumb } from "./DownsampledThumb";
import { openThreadGallery } from "./useThreadGalleryImages";
import { ThreadDockCollapseButton, ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";
import { Button } from "@/renderer/components/common/Button";
import { useAppStore } from "@/renderer/state/appStore";
import { buildFileEditorContext, openFileInEditor } from "@/renderer/utils/gitHelpers";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { createChatPaneFileActions } from "./ChatPane/chatPaneFileActions";
import type { ThreadArtifact } from "./threadArtifacts";

const EMPTY_ARTIFACTS: readonly ThreadArtifact[] = [];

/**
 * Right-panel "Images" section: a 2-row horizontal mosaic of every renderable
 * image in the thread's loaded history, newest first. Thumbnails lazy-load
 * (`loading="lazy"` + `decoding="async"`) so opening the panel never fetches
 * off-screen bytes up front, then downsample to a 2x device-pixel contain
 * rect so each tile shows the full, sharp image. Clicking any tile opens the
 * fullscreen lightbox at that image with prev/next across the whole thread.
 */
export function ThreadImagesDock({
  gallery,
  threadId,
  artifacts = EMPTY_ARTIFACTS,
}: {
  gallery: readonly ThreadGalleryImage[];
  /** Enables live gallery updates in the open lightbox when provided. */
  threadId?: string | undefined;
  artifacts?: readonly ThreadArtifact[];
}) {
  const { t } = useLingui();
  const [collapsed, setCollapsed] = useState(false);
  if (gallery.length === 0 && artifacts.length === 0) return null;
  const label = artifacts.length > 0 ? t`Files & artifacts` : t`Images`;

  function openArtifact(artifact: ThreadArtifact) {
    if (artifact.external) {
      openExternalWithFeedback(artifact.target);
      return;
    }
    const state = useAppStore.getState();
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    const project = state.projects.find((candidate) => candidate.id === thread?.projectId);
    if (!thread || !project) return;
    const context = buildFileEditorContext(project, thread.worktreePath, thread.worktreeBranch);
    const actions = createChatPaneFileActions({
      project,
      targetContext: context,
      worktreePath: thread.worktreePath,
      branch: thread.worktreeBranch,
      onOpenProjectRelativePath: (path, line) => {
        void openFileInEditor(project, thread.worktreePath, thread.worktreeBranch, path, line);
      },
    });
    void actions.openProjectRelativePath?.(artifact.target).catch(() => {
      toast.danger(t`Unable to open the file in the editor`);
    });
  }
  return (
    <ThreadDockSection
      placement="right"
      collapsed={collapsed}
      ariaLabel={label}
      className="min-w-0 [&[data-placement='right']]:h-auto"
    >
      <div data-images-dock="true" className="min-w-0">
        <ThreadDockHeader
          icon={artifacts.length > 0 ? FileText : Images}
          title={label}
          collapse={{ collapsed, onToggle: () => setCollapsed(!collapsed) }}
          countLabel={
            <span className="[font-variant-numeric:tabular-nums]">
              {gallery.length + artifacts.length}
            </span>
          }
          actions={
            <ThreadDockCollapseButton
              collapsed={collapsed}
              label={
                artifacts.length > 0
                  ? collapsed
                    ? t`Expand files & artifacts`
                    : t`Collapse files & artifacts`
                  : collapsed
                    ? t`Expand images`
                    : t`Collapse images`
              }
              onPress={() => setCollapsed(!collapsed)}
            />
          }
        />
        {!collapsed ? (
          <div className="px-1 pb-1">
            {artifacts.length > 0 ? (
              <ul className="mb-2 space-y-0.5">
                {artifacts.map((artifact) => (
                  <li key={artifact.target} title={artifact.target}>
                    <Button
                      variant="ghost"
                      className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 text-left text-xs"
                      onPress={() => openArtifact(artifact)}
                    >
                      {artifact.external ? (
                        <ExternalLink className="size-3.5 shrink-0 text-muted" />
                      ) : (
                        <FileText className="size-3.5 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{artifact.name}</span>
                        <span className="block truncate text-[0.6875rem] text-muted">
                          {artifact.target}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            {gallery.length > 0 ? (
              <div
                className="grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto pb-1 [scrollbar-gutter:stable]"
                role="list"
                aria-label={t`Thread images`}
              >
                {gallery.map((img, index) => (
                  <div key={img.resource?.key ?? img.src} role="listitem" className="shrink-0">
                    <button
                      type="button"
                      aria-label={t`Open image ${index + 1} of ${gallery.length}`}
                      title={img.alt || t`Open image preview`}
                      className="group relative block h-24 w-40 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--composer-surface)] focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => openThreadGallery(gallery, undefined, index, threadId)}
                    >
                      {img.src ? (
                        <DownsampledThumb
                          src={img.src}
                          alt={img.alt || ""}
                          cssPx={160}
                          fit="contain"
                          resolutionScale={2}
                          className="size-full rounded-[inherit] object-contain [image-rendering:high-quality]"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/0 transition-colors duration-150 group-hover:bg-foreground/10"
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ThreadDockSection>
  );
}
