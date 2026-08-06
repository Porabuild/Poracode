import { useShallow } from "zustand/shallow";
import { useFileEditorStore } from "./fileEditorStore";
import type { ProjectFileReadStatus } from "@/shared/contracts";

/** Ordered list of open tab paths (shallow-stable). */
export function useTabPaths(): string[] {
  return useFileEditorStore(useShallow((s) => s.tabs));
}

/** Whether a specific path is the currently active (selected) tab. */
export function useIsTabActive(path: string): boolean {
  return useFileEditorStore((s) => s.activePath === path);
}

/** Whether a specific tab is the preview tab. */
export function useIsTabPreview(path: string): boolean {
  return useFileEditorStore((s) => s.previewTab === path);
}

/** Whether a specific tab's buffer has unsaved changes. */
export function useIsTabDirty(path: string): boolean {
  return useFileEditorStore((s) => {
    const buf = s.buffers[path];
    return buf?.status === "ready" && buf.isDirty;
  });
}

/** Active buffer content, or undefined if none open / not ready. */
export function useActiveBufferContent(): string | undefined {
  return useFileEditorStore((s) => {
    const path = s.activePath;
    if (!path) return undefined;
    const buf = s.buffers[path];
    return buf?.status === "ready" ? buf.content : undefined;
  });
}

/** Status of the active buffer. */
export function useActiveBufferStatus(): ProjectFileReadStatus | null {
  return useFileEditorStore((s) => {
    const path = s.activePath;
    if (!path) return null;
    return s.buffers[path]?.status ?? null;
  });
}

/** Dirty flag for the currently active buffer. */
export function useIsActiveBufferDirty(): boolean {
  return useFileEditorStore((s) => {
    const path = s.activePath;
    if (!path) return false;
    const buf = s.buffers[path];
    return buf?.status === "ready" && buf.isDirty;
  });
}

/** Whether a given path is currently open as a tab (not necessarily active). */
export function useIsPathOpenInTab(path: string): boolean {
  return useFileEditorStore((s) => s.tabs.includes(path));
}

/** Imperative check: any open buffer has unsaved changes. */
export function hasDirtyEditorBuffers(): boolean {
  return Object.values(useFileEditorStore.getState().buffers).some(
    (buffer) => buffer.status === "ready" && buffer.isDirty,
  );
}
