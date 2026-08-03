import { useCallback } from "react";
import { toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import type { PromptSegment } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { isDraftPaneId, parseDraftProjectId } from "@/shared/paneId";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { buildSelectorPlainText, useBrowserAttachInbox } from "@/renderer/state/browserAttachInbox";
import { useComposerUiStore } from "@/renderer/state/composerUiStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useBrowserPanelStore,
  type PendingPickerAttachment,
} from "@/renderer/state/browserPanelStore";

/** Where a picked browser element is delivered for a given thread. */
export type PickDestination = "terminal" | "composer";

export interface PickerThreadTarget {
  threadId: string;
  title: string;
  /** True for a launched terminal-native thread the pick can be typed into. */
  canRouteToTerminal: boolean;
}

interface PickerOutcome {
  ok: boolean;
  cancelled: boolean;
  error?: string;
  needsThreadChoice?: boolean;
}

const PICKER_TEMP_THREAD_PREFIX = "picker-";

function draftTargetId(projectId: string): string {
  return `draft:${projectId}`;
}

function findActiveWebviewRect(tabId: string): DOMRect | null {
  const direct = document.querySelector<HTMLElement>(`webview[data-tab-id="${tabId}"]`);
  if (direct) {
    const r = direct.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  for (const wv of document.querySelectorAll<HTMLElement>("webview")) {
    if (wv.getAttribute("data-tab-id") !== tabId) continue;
    const r = wv.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  for (const wv of document.querySelectorAll<HTMLElement>("webview")) {
    const r = wv.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

function anchorFromSelectedRect(
  tabId: string,
  selected: { x: number; y: number; width: number; height: number },
): { x: number; y: number } | null {
  const wvRect = findActiveWebviewRect(tabId);
  if (!wvRect) return null;
  return {
    x: wvRect.left + selected.x,
    y: wvRect.top + selected.y + selected.height,
  };
}

function resolveTargetThreadIds(): string[] {
  const state = useAppStore.getState();
  if (state.view.kind === "draft") return [draftTargetId(state.view.projectId)];
  if (state.view.kind !== "thread") return [];
  return [...state.view.panes];
}

/**
 * Reads the live, rendered presentation + collapsed state of a thread's
 * composer (published by `ThreadComposerSection`), falling back to the stored
 * thread when no composer is mounted. Drafts have no PTY, so they never route
 * to the terminal.
 */
function resolveTerminalRouting(threadId: string): { isCli: boolean; collapsed: boolean } {
  if (isDraftPaneId(threadId)) return { isCli: false, collapsed: false };
  const ui = useComposerUiStore.getState().byThread[threadId];
  if (ui) return { isCli: ui.presentation === "terminal", collapsed: ui.collapsed };
  const thread = useAppStore.getState().threads.find((t) => t.id === threadId);
  return { isCli: (thread?.presentationMode ?? "terminal") === "terminal", collapsed: false };
}

/**
 * Resolves where a pick should go for a single thread. GUI threads only have a
 * composer. For CLI threads the `cliPickerTarget` setting decides, except that a
 * collapsed composer always routes to the terminal under "ask" (the attachment
 * bar is hidden, so there is nowhere visible for it to land).
 */
function resolvePickDestination(threadId: string): PickDestination | "ask" {
  const { isCli, collapsed } = resolveTerminalRouting(threadId);
  if (!isCli) return "composer";
  const target = useSharedSettings.getState().cliPickerTarget;
  if (target === "terminal") return "terminal";
  if (target === "composer") return "composer";
  return collapsed ? "terminal" : "ask";
}

function buildSelectionSegments(attachment: PendingPickerAttachment): {
  prompt: string;
  segments: PromptSegment[];
} {
  const selectorText = buildSelectorPlainText({
    selector: attachment.selector,
    sourceUrl: attachment.sourceUrl,
  });
  return {
    prompt: selectorText,
    segments: [
      {
        kind: "attachment",
        path: attachment.attachmentPath,
        mimeType: attachment.mimeType,
      },
      { kind: "text", content: selectorText },
    ],
  };
}

export async function materializePickerAttachment(
  threadId: string,
  attachment: PendingPickerAttachment,
): Promise<PendingPickerAttachment> {
  const { data, ...materialized } = attachment;
  if (!data) return materialized;
  const uploadData = new Uint8Array(data);

  const app = useAppStore.getState();
  if (isDraftPaneId(threadId)) {
    const project = app.projects.find(
      (candidate) => candidate.id === parseDraftProjectId(threadId),
    );
    const owner = remoteOwner(project);
    if (!owner) return materialized;
    const attachmentPath = await useRemoteServersStore
      .getState()
      .saveClipboardImage(owner.desktopId, {
        threadId: `draft-${owner.remoteId}`,
        data: uploadData,
        extension: "png",
      });
    return { ...materialized, attachmentPath };
  }

  const thread = app.threads.find((candidate) => candidate.id === threadId);
  if (!remoteOwner(thread)) return materialized;
  const attachmentPath = await readBridge().saveClipboardImage({
    threadId,
    data: uploadData,
    extension: "png",
  });
  return { ...materialized, attachmentPath };
}

export function useElementPicker() {
  const { t } = useLingui();
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);
  const pickerActive = useBrowserPanelStore((s) => s.pickerActive);
  const setPickerActive = useBrowserPanelStore((s) => s.setPickerActive);
  const pendingPickerAttachment = useBrowserPanelStore((s) => s.pendingPickerAttachment);
  const setPendingPickerAttachment = useBrowserPanelStore((s) => s.setPendingPickerAttachment);
  const enqueueAttach = useBrowserAttachInbox((s) => s.enqueue);
  const targetThreadIds = useAppStore(
    useShallow((state) => {
      if (state.view.kind === "draft") return [draftTargetId(state.view.projectId)];
      if (state.view.kind !== "thread") return [];
      return [...state.view.panes];
    }),
  );
  const threads = useAppStore((s) => s.threads);
  const projects = useAppStore((s) => s.projects);
  const threadTargets: PickerThreadTarget[] = targetThreadIds.map((paneId) => {
    // `resolveTerminalRouting` is the single source for the presentation/draft
    // rule; it reads the live composer state on demand, so no subscription here.
    const canRouteToTerminal = resolveTerminalRouting(paneId).isCli;
    if (isDraftPaneId(paneId)) {
      const projectId = parseDraftProjectId(paneId);
      const projectName = projects.find((p) => p.id === projectId)?.name;
      return {
        threadId: paneId,
        title: projectName ? t`New thread — ${projectName}` : t`New thread`,
        canRouteToTerminal,
      };
    }
    const targetThread = threads.find((thread) => thread.id === paneId);
    return { threadId: paneId, title: targetThread?.title ?? t`Thread`, canRouteToTerminal };
  });

  const cancelPicker = useCallback(async (): Promise<PickerOutcome> => {
    try {
      await readBridge().browserCancelPicker();
    } catch {}
    setPickerActive(false);
    return { ok: true, cancelled: true };
  }, [setPickerActive]);

  const deliverPick = useCallback(
    async (threadId: string, destination: PickDestination, attachment: PendingPickerAttachment) => {
      let routedAttachment: PendingPickerAttachment;
      try {
        routedAttachment = await materializePickerAttachment(threadId, attachment);
      } catch (error) {
        const message = friendlyError(error);
        toast.danger(message);
        return message;
      }
      if (destination === "terminal") {
        const { prompt, segments } = buildSelectionSegments(routedAttachment);
        try {
          await readBridge().stageThreadInput({ threadId, prompt, segments });
          toast.success(t`Sent selection to terminal.`);
          return null;
        } catch (error) {
          // The PTY may not be ready (still launching, exited). Don't lose the
          // pick — drop it into the composer instead.
          console.error("[picker] failed to stage terminal input", error);
          enqueueAttach({ threadId, ...routedAttachment });
          toast.warning(t`Terminal not ready — added selection to composer.`);
          return null;
        }
      }
      enqueueAttach({ threadId, ...routedAttachment });
      toast.success(t`Attached browser selection.`);
      return null;
    },
    [enqueueAttach, t],
  );

  const startPicker = useCallback(async (): Promise<PickerOutcome> => {
    if (pickerActive) {
      return await cancelPicker();
    }
    if (!activeTabId) {
      const error = t`No active browser tab`;
      toast.danger(error);
      return { ok: false, cancelled: false, error };
    }
    const targetIds = resolveTargetThreadIds();
    if (targetIds.length === 0) {
      const error = t`Open a thread first to attach to it.`;
      toast.danger(error);
      return { ok: false, cancelled: false, error };
    }
    setPendingPickerAttachment(null);
    setPickerActive(true);
    try {
      const tempThreadId = PICKER_TEMP_THREAD_PREFIX + crypto.randomUUID();
      const result = await readBridge().browserStartPicker({
        threadId: tempThreadId,
        tabId: activeTabId,
      });
      if (!result.ok) {
        const error = result.error ?? t`Picker failed`;
        toast.danger(error);
        return { ok: false, cancelled: false, error };
      }
      if (result.cancelled) {
        return { ok: true, cancelled: true };
      }
      if (
        !(result.attachmentPath && result.attachmentName && result.selector && result.sourceUrl)
      ) {
        const error = t`Picker returned no attachment`;
        toast.danger(error);
        return { ok: false, cancelled: false, error };
      }
      const anchor = result.rect ? anchorFromSelectedRect(activeTabId, result.rect) : null;
      const attachment: PendingPickerAttachment = {
        attachmentPath: result.attachmentPath,
        attachmentName: result.attachmentName,
        mimeType: result.mimeType ?? "image/png",
        ...(result.data ? { data: result.data } : {}),
        selector: result.selector,
        sourceUrl: result.sourceUrl,
        ...(anchor ? { anchorX: anchor.x, anchorY: anchor.y } : {}),
      };
      if (targetIds.length === 1) {
        const threadId = targetIds[0]!;
        const destination = resolvePickDestination(threadId);
        if (destination !== "ask") {
          const error = await deliverPick(threadId, destination, attachment);
          if (error) return { ok: false, cancelled: false, error };
          return { ok: true, cancelled: false };
        }
      }
      setPendingPickerAttachment(attachment);
      return { ok: true, cancelled: false, needsThreadChoice: true };
    } finally {
      setPickerActive(false);
    }
  }, [
    activeTabId,
    cancelPicker,
    deliverPick,
    pickerActive,
    setPendingPickerAttachment,
    setPickerActive,
    t,
  ]);

  const chooseTargetForPendingPick = useCallback(
    (threadId: string, destination: PickDestination) => {
      const pending = useBrowserPanelStore.getState().pendingPickerAttachment;
      if (!pending) return;
      setPendingPickerAttachment(null);
      void deliverPick(threadId, destination, pending);
    },
    [deliverPick, setPendingPickerAttachment],
  );

  const cancelPendingPick = useCallback(() => {
    setPendingPickerAttachment(null);
  }, [setPendingPickerAttachment]);

  return {
    pickerActive,
    startPicker,
    threadTargets,
    pendingPickerAttachment,
    chooseTargetForPendingPick,
    cancelPendingPick,
  };
}
