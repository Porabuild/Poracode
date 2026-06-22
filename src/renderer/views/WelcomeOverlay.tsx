import { useEffect, useState, useRef } from "react";
import { FolderPlus, MessageSquareText } from "lucide-react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { readStoredBoolean, writeStoredBoolean } from "@/renderer/utils/localStorage";
import { CreateProjectMenu } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu";
import { WELCOME_BACKGROUND_CODE } from "./welcomeBackgroundCode";
import appIconUrl from "../../../build/icon.png";

const WELCOME_SEEN_STORAGE_KEY = "lightcode-welcome-seen-v16";

// Orbit + reveal animations finish ~2.4s after the overlay mounts. After
// that the comet has scaled to 0 and no longer needs its center sampled, so
// the rAF loop driving `--comet-x/y` can stop.
const ORBIT_DURATION_MS = 2400;

export function WelcomeOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cometRef = useRef<HTMLSpanElement>(null);
  const mouseRafRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRectRef = useRef<DOMRect | null>(null);

  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const openDraft = useAppStore((state) => state.openDraft);

  // `welcomeSeen` is read synchronously from localStorage so the overlay's
  // open state is known on the very first render — no async settings gate, so
  // the main UI never paints uncovered behind the overlay on first launch.
  const [welcomeSeen, setWelcomeSeen] = useState(() =>
    readStoredBoolean(WELCOME_SEEN_STORAGE_KEY, false),
  );
  const open = !welcomeSeen;
  const [mounted, setMounted] = useState(open);
  // Initialize `visible` to `open` so the overlay is fully opaque on first
  // paint — the inner reveal/orbit animations are driven by CSS keyframes,
  // not by toggling `visible`, so we don't need a RAF flip on entry.
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setVisible(true);
      return;
    }
    setVisible(false);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    let rafId = 0;
    let stopped = false;
    const updateCometLight = () => {
      if (stopped) return;
      if (containerRef.current && cometRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const cometRect = cometRef.current.getBoundingClientRect();
        const cx = cometRect.left + cometRect.width / 2 - containerRect.left;
        const cy = cometRect.top + cometRect.height / 2 - containerRect.top;
        containerRef.current.style.setProperty("--comet-x", `${cx}px`);
        containerRef.current.style.setProperty("--comet-y", `${cy}px`);
      }
      rafId = requestAnimationFrame(updateCometLight);
    };
    rafId = requestAnimationFrame(updateCometLight);
    const stopTimer = window.setTimeout(() => {
      stopped = true;
      cancelAnimationFrame(rafId);
    }, ORBIT_DURATION_MS);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      clearTimeout(stopTimer);
    };
  }, [mounted]);

  function handleTransitionEnd(e: React.TransitionEvent) {
    if (e.target === e.currentTarget && !visible) {
      setMounted(false);
    }
  }

  function dismissWelcome() {
    writeStoredBoolean(WELCOME_SEEN_STORAGE_KEY, true);
    setWelcomeSeen(true);
  }

  function handleAskQuestion() {
    if (!homeScopeEnabled) {
      setHomeScopeEnabled(true);
    }
    dismissWelcome();

    const existingHomeProject = useAppStore.getState().projects.find(isHomeProject);
    if (existingHomeProject) {
      openDraft(existingHomeProject.id);
      return;
    }

    void loadHomeScopeLocation()
      .then((location) => {
        const project = useAppStore.getState().ensureHomeProject(location);
        openDraft(project.id);
      })
      .catch(() => {
        useAppStore.getState().openHome();
      });
  }

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      className={`lightcode-welcome-page fixed inset-0 z-50 flex flex-col bg-background transition-opacity ${
        visible ? "opacity-100 duration-150" : "opacity-0 duration-500"
      }`}
      onTransitionEnd={handleTransitionEnd}
      onMouseMove={(e) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };
        if (mouseRafRef.current !== null) return;
        mouseRafRef.current = requestAnimationFrame(() => {
          mouseRafRef.current = null;
          const container = containerRef.current;
          const pos = mousePosRef.current;
          if (!container || !pos) return;
          // Cache rect across frames; only the document scroll or resize
          // invalidates it, and either re-fires mousemove afterward.
          if (!containerRectRef.current) {
            containerRectRef.current = container.getBoundingClientRect();
          }
          const rect = containerRectRef.current;
          container.style.setProperty("--mouse-x", `${pos.x - rect.left}px`);
          container.style.setProperty("--mouse-y", `${pos.y - rect.top}px`);
        });
      }}
      onMouseLeave={() => {
        containerRectRef.current = null;
        if (mouseRafRef.current !== null) {
          cancelAnimationFrame(mouseRafRef.current);
          mouseRafRef.current = null;
        }
      }}
    >
      <div className="lightcode-welcome-bg-glow absolute inset-0 z-0 pointer-events-none" />
      <pre
        className="lightcode-welcome-code-wall absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50 p-8 m-0"
        aria-hidden="true"
      >
        {WELCOME_BACKGROUND_CODE}
      </pre>

      <div
        className="lightcode-overlay-header relative z-10 flex shrink-0 items-center px-2"
        style={{ height: "env(titlebar-area-height, 32px)" }}
      />

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <div className="lightcode-welcome-stage flex w-full max-w-[680px] flex-col items-center gap-8 text-center">
          <div className="lightcode-welcome-icon-wrap relative flex size-24 items-center justify-center">
            <span className="lightcode-welcome-light absolute inset-[-18px] rounded-full" />
            <span className="lightcode-welcome-splash absolute inset-[-26px] rounded-full" />
            <span className="lightcode-welcome-orbit absolute inset-[-12px] rounded-full">
              <span
                ref={cometRef}
                className="lightcode-welcome-comet absolute left-1/2 top-0 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
              />
            </span>
            <span className="lightcode-welcome-ring absolute inset-[5px] rounded-[1.85rem]" />
            <span className="lightcode-welcome-reveal lightcode-welcome-icon-glass absolute inset-2 rounded-[1.65rem]" />
            <img
              src={appIconUrl}
              alt=""
              draggable={false}
              className="lightcode-welcome-reveal relative size-20 rounded-[1.55rem]"
            />
          </div>

          <div
            className={`lightcode-welcome-reveal lightcode-welcome-reveal-1 flex flex-col items-center gap-3 transition-all duration-700 ${
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <h1 className="flex items-baseline gap-3 overflow-visible pr-[0.22em] pb-[0.2em] text-[clamp(3.25rem,8vw,6.25rem)] leading-[1.28] font-semibold tracking-normal">
              <span className="inline-block pr-[0.04em] pb-[0.12em] text-transparent [background-image:linear-gradient(135deg,var(--foreground)_0%,color-mix(in_oklab,var(--accent)_60%,var(--foreground))_52%,var(--muted)_100%)] [background-size:100%_100%] bg-clip-text">
                Lightcode
              </span>
            </h1>
            <p className="text-sm text-muted">
              <Trans>Where do you want to begin?</Trans>
            </p>
          </div>

          <div
            className={`lightcode-welcome-reveal lightcode-welcome-reveal-2 grid w-full max-w-[460px] grid-cols-1 gap-3 transition-all delay-150 duration-700 sm:grid-cols-2 ${
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <Button
              fullWidth
              size="lg"
              variant="tertiary"
              className="lightcode-welcome-button h-12 justify-center gap-2 !text-white"
              onPress={handleAskQuestion}
            >
              <MessageSquareText className="size-4" />
              <Trans>Ask Question</Trans>
              <span className="rounded-full bg-white/12 px-1.5 py-0.5 text-[10px] leading-none text-white/90">
                <Trans>Home</Trans>
              </span>
            </Button>
            <CreateProjectMenu onSelect={dismissWelcome}>
              <Button
                fullWidth
                size="lg"
                variant="tertiary"
                className="lightcode-welcome-button h-12 justify-center gap-2 !text-white"
              >
                <FolderPlus className="size-4" />
                <Trans>Add Project</Trans>
              </Button>
            </CreateProjectMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
