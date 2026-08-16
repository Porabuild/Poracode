import { useEffect, useState, useRef } from "react";
import { FolderPlus, MessageSquareText, Server } from "lucide-react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isHomeProject } from "@/shared/homeScope";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import { hasClientCapability, isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  isWelcomeSeen,
  useWelcomeGateStore,
  WELCOME_SEEN_STORAGE_KEY,
} from "@/renderer/state/welcomeGateStore";
import { writeStoredBoolean } from "@/renderer/utils/localStorage";
import { BrandWordmark } from "@/renderer/components/common/BrandWordmark";
import { WelcomeAppIcon } from "@/renderer/components/common/WelcomeAppIcon";
import { CreateProjectMenu } from "@/renderer/views/MainView/parts/CreateProject/CreateProjectMenu";
import { WELCOME_BACKGROUND_CODE } from "./welcomeBackgroundCode";

// The intro reveal fully settles ~3.2s after mount — the CTA buttons carry the
// latest reveal (2.4s delay + 0.8s duration). Until then we hold first-launch
// background work (agent detection) so its cold process spawns and re-render
// churn don't starve the animation's first paint and snap it to its final
// frame. A user who clicks a CTA sooner releases the gate immediately in
// `dismissWelcome`.
const WELCOME_SETTLE_MS = 3200;

export function WelcomeOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRafRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const containerRectRef = useRef<DOMRect | null>(null);

  const homeScopeEnabled = useSharedSettings((state) => state.homeScopeEnabled);
  const setHomeScopeEnabled = useSharedSettings((state) => state.setHomeScopeEnabled);
  const openDraft = useAppStore((state) => state.openDraft);
  const browserClient = isBrowserClientRuntime();
  // Browser clients have no local backend: there is no local home scope or
  // folder picker, so the only sensible first action is pairing with a remote
  // Poracode server (see docs/REMOTE_ARCHITECTURE.md).
  const localBackend = hasClientCapability("localBackend");

  // `welcomeSeen` is resolved synchronously from localStorage (or the dev-only
  // manual-test bypass) so the overlay's open state is known on the very first
  // render — no async settings gate, so the main UI never paints uncovered
  // behind the overlay on first launch.
  const [welcomeSeen, setWelcomeSeen] = useState(isWelcomeSeen);
  const open = !welcomeSeen;
  const [mounted, setMounted] = useState(open);
  // Initialize `visible` to `open` so the overlay is fully opaque on first
  // paint — the inner reveal/orbit animations are driven by CSS keyframes,
  // not by toggling `visible`, so we don't need a RAF flip on entry.
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (browserClient) {
      useWelcomeGateStore.getState().releaseBackgroundWork();
    }
  }, [browserClient]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setVisible(true);
      return;
    }
    setVisible(false);
  }, [open]);

  // First launch only: defer heavy background work until the intro animation
  // has settled, then release the gate so MainView can start agent detection.
  useEffect(() => {
    if (browserClient || !open) return;
    const releaseTimer = window.setTimeout(() => {
      useWelcomeGateStore.getState().releaseBackgroundWork();
    }, WELCOME_SETTLE_MS);
    return () => clearTimeout(releaseTimer);
  }, [browserClient, open]);

  function handleTransitionEnd(e: React.TransitionEvent) {
    if (e.target === e.currentTarget && !visible) {
      setMounted(false);
    }
  }

  function dismissWelcome() {
    writeStoredBoolean(WELCOME_SEEN_STORAGE_KEY, true);
    setWelcomeSeen(true);
    // The user is moving on — let deferred startup work (agent detection) run
    // now rather than waiting out the settle timer.
    useWelcomeGateStore.getState().releaseBackgroundWork();
  }

  function handleConnectRemote() {
    dismissWelcome();
    usePanelStore.getState().openSettingsSection("remoteServers");
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

  // Browser clients have their own connection-first welcome surface behind the
  // remote connection gate. Never cover it with the desktop onboarding overlay.
  if (browserClient || !mounted) return null;

  return (
    <div
      ref={containerRef}
      className={`poracode-welcome-page fixed inset-0 z-50 flex flex-col bg-background transition-opacity ${
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
      <div className="poracode-welcome-bg-glow absolute inset-0 z-0 pointer-events-none" />
      <pre
        className="poracode-welcome-code-wall absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50 p-8 m-0"
        aria-hidden="true"
      >
        {WELCOME_BACKGROUND_CODE}
      </pre>

      <div
        className="poracode-overlay-header relative z-10 flex shrink-0 items-center px-2"
        style={{ height: "env(titlebar-area-height, 32px)" }}
      />

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <div className="poracode-welcome-stage flex w-full max-w-[680px] flex-col items-center gap-8 text-center">
          <WelcomeAppIcon />

          <div
            className={`poracode-welcome-reveal poracode-welcome-reveal-1 flex flex-col items-center gap-3 transition-all duration-700 ${
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <h1 className="flex items-baseline gap-3 overflow-visible pr-[0.22em] pb-[0.2em] text-[clamp(3.25rem,8vw,6.25rem)] leading-[1.28] font-semibold tracking-normal">
              <BrandWordmark className="inline-block pr-[0.04em] pb-[0.12em]" />
            </h1>
            <p className="text-sm text-muted">
              <Trans>Where do you want to begin?</Trans>
            </p>
          </div>

          <div
            className={`poracode-welcome-reveal poracode-welcome-reveal-2 grid w-full max-w-[460px] grid-cols-1 gap-3 transition-all delay-150 duration-700 sm:grid-cols-2 ${
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            {localBackend ? (
              <>
                <Button
                  fullWidth
                  size="lg"
                  variant="tertiary"
                  className="poracode-welcome-button h-12 justify-center gap-2 !text-white"
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
                    className="poracode-welcome-button h-12 justify-center gap-2 !text-white"
                  >
                    <FolderPlus className="size-4" />
                    <Trans>Add Project</Trans>
                  </Button>
                </CreateProjectMenu>
              </>
            ) : (
              <Button
                fullWidth
                size="lg"
                variant="tertiary"
                className="poracode-welcome-button h-12 justify-center gap-2 !text-white sm:col-span-2"
                onPress={handleConnectRemote}
              >
                <Server className="size-4" />
                <Trans>Connect to a remote server</Trans>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
