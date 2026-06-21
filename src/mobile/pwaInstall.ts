import { useSyncExternalStore } from "react";

/**
 * PWA install + launch-context helpers.
 *
 * Universal Links (iOS) / App Links (Android) handle the "open the installed
 * native app vs the browser PWA" routing at the OS level — see the association
 * files under public/.well-known and docs/RELEASE_MOBILE.md. This module covers
 * the in-browser side: detecting how the app was launched and surfacing the
 * "Add to Home Screen" install prompt where the browser offers one.
 */

type BeforeInstallPromptEvent = Event & {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the default mini-infobar so we can offer install on our terms.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

/** True once the browser has offered an installability prompt we can replay. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Replay the captured install prompt; resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredPrompt = null;
  emit();
  return choice.outcome === "accepted";
}

/** Reactive `canInstall()` for components. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    canInstall,
    () => false,
  );
}

/** The app is running as an installed PWA (home-screen / standalone window). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** The app is running inside the Capacitor native shell (App Store / Play). */
export function isNativeApp(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}
