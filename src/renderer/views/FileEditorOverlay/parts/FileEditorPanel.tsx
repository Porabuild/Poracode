import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { FileEditorPane } from "./FileEditorPane/FileEditorPane";

/**
 * Inline panel overlay that covers the main content area (no modal, no backdrop).
 * Files are selected from the right sidebar's file tree.
 */
export function FileEditorPanel() {
  const { t } = useLingui();
  const rootContext = useFileEditorStore((state) => state.rootContext);
  const overlayMode = useFileEditorStore((state) => state.overlayMode);
  const setOverlayMode = useFileEditorStore((state) => state.setOverlayMode);

  const isOpen = rootContext !== null && overlayMode === "modal";

  // Fade-in animation
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    return undefined;
  }, [isOpen]);

  const requestClose = () => {
    const hasDirty = Object.values(useFileEditorStore.getState().buffers).some(
      (buffer) => buffer.status === "ready" && buffer.isDirty,
    );
    if (hasDirty && !window.confirm(t`Discard unsaved editor changes?`)) {
      return;
    }
    setOverlayMode(null);
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the listener is scoped to the open lifecycle and requestClose reads the matching render state.
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col bg-[var(--content-background)] transition-opacity duration-100 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <FileEditorPane showTabs headerNeedsTrafficLightPad onClose={requestClose} />
    </div>
  );
}
