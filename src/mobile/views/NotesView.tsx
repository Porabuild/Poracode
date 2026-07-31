import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft, NotebookPen } from "lucide-react";
import { lockMobileSheetViewport } from "@/renderer/components/common/mobileSheetViewportLock";
import { NotesPanel } from "@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/NotesPanel";
import { focusWithoutScroll } from "../composeScrollLock";

function editableTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.matches("input, textarea, [contenteditable='true']")) return target;
  return target.closest<HTMLElement>("input, textarea, [contenteditable='true']");
}

interface VisualViewportBounds {
  readonly top: number;
  readonly bottom: number;
}

function useVisualViewportBounds(): VisualViewportBounds {
  const [bounds, setBounds] = useState<VisualViewportBounds>({ top: 0, bottom: 0 });

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const top = Math.max(
        0,
        Number.isFinite(viewport.offsetTop) ? Math.round(viewport.offsetTop) : 0,
        Number.isFinite(viewport.pageTop) ? Math.round(viewport.pageTop) : 0,
        Number.isFinite(window.scrollY) ? Math.round(window.scrollY) : 0,
      );
      const layoutHeight = window.innerHeight || document.documentElement.clientHeight;
      setBounds({
        top,
        bottom: Math.max(0, Math.round(layoutHeight - top - viewport.height)),
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return bounds;
}

/** Fullscreen mobile surface for a thread's project-scoped notes and to-dos. */
export function NotesView(props: {
  readonly projectId: string;
  readonly projectName: string;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const visualViewport = useVisualViewportBounds();
  const screenRef = useRef<HTMLElement>(null);
  const releaseViewportLockRef = useRef<(() => void) | null>(null);
  const releaseTimerRef = useRef(0);

  const lockViewport = () => {
    window.clearTimeout(releaseTimerRef.current);
    releaseViewportLockRef.current ??= lockMobileSheetViewport();
  };

  const releaseViewportWhenFocusLeaves = () => {
    window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      if (screenRef.current?.contains(document.activeElement)) return;
      releaseViewportLockRef.current?.();
      releaseViewportLockRef.current = null;
    });
  };

  useEffect(
    () => () => {
      window.clearTimeout(releaseTimerRef.current);
      releaseViewportLockRef.current?.();
    },
    [],
  );

  return (
    <section
      ref={screenRef}
      className="m-notes-screen"
      style={
        {
          "--m-visual-viewport-bottom": `${visualViewport.bottom}px`,
          "--m-visual-viewport-top": `${visualViewport.top}px`,
        } as CSSProperties
      }
      onPointerDownCapture={(event) => {
        const editable = editableTarget(event.target);
        if (!editable) return;
        lockViewport();
        focusWithoutScroll(editable);
      }}
      onFocusCapture={(event) => {
        if (editableTarget(event.target)) lockViewport();
      }}
      onBlurCapture={releaseViewportWhenFocusLeaves}
    >
      <header className="m-git-head">
        <button className="m-back" type="button" aria-label={t`Back`} onClick={props.onClose}>
          <ChevronLeft className="size-5" />
        </button>
        <span className="m-git-head__title">
          <NotebookPen className="size-3.5 shrink-0 text-muted/60" />
          <span className="m-git-head__project">{props.projectName}</span>
          <span className="m-git-head__sep">/</span>
          <span className="m-git-head__branch">{t`Notes & to-dos`}</span>
        </span>
      </header>
      <div className="m-notes-screen__body">
        <NotesPanel projectId={props.projectId} />
      </div>
    </section>
  );
}
