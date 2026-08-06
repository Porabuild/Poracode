import { useState } from "react";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import {
  useHasStoredSession,
  useUsageLoginStateStore,
} from "@/renderer/state/usageLoginStateStore";
import { supportsApiKeyLogin, supportsBrowserLogin } from "./usageProviders";

/**
 * Sign-in / sign-out flow for a usage provider, shared by the usage panel card
 * and the Settings → Usage rows so both surfaces behave identically (browser
 * overlay capture, API-key paste, and persistent stored-session sync). Reads the
 * live snapshot to decide whether a "Sign in" affordance is warranted.
 */
export function useUsageProviderLogin(id: string) {
  const snapshot = useProviderUsage(id);
  const hasStoredSession = useHasStoredSession(id);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const isRemote = isRemoteSession();

  const isApiKeyLogin = supportsApiKeyLogin(id);
  const isBrowserLogin = supportsBrowserLogin(id);
  const supportsLogin = !isRemote && (isBrowserLogin || isApiKeyLogin);
  // A stored session the latest fetch reports as rejected (expired cookie) still
  // warrants a "Sign in" to re-auth; an unauthenticated provider always does. But
  // never prompt sign-in once a fetch succeeds ("ok"): a provider authenticated
  // by another path (e.g. Copilot's OAuth/CLI token) has no stored cookie session
  // yet is signed in — offering "Sign in" there is wrong.
  const sessionRejected = snapshot?.status === "auth-missing";
  const canSignIn =
    supportsLogin && snapshot?.status !== "ok" && (!hasStoredSession || sessionRejected);
  const canBrowserSignIn = canSignIn && isBrowserLogin;
  const canApiKeySignIn = canSignIn && isApiKeyLogin;
  const canSignOut = supportsLogin && hasStoredSession;

  const mergeFreshSnapshot = async () => {
    const usage = await readBridge().refreshProviderUsage({ providerIds: [id] });
    const fresh = usage.snapshots.find((s) => s.providerId === id);
    if (fresh) useProviderUsageStore.getState().mergeSnapshot(fresh);
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    // Open the browser-overlay drawer (not maximized) so the login tab renders
    // there. Force-clear maximized in case a prior session left it fullscreen.
    usePanelStore.getState().setBrowserOverlayMaximized(false);
    usePanelStore.getState().setBrowserOverlayOpen(true);

    // Release the moment the user closes the overlay — don't depend on main's
    // cancel round-trip resolving, so the button can never hang in "Signing in…".
    let unsubscribe = () => {};
    const overlayClosed = new Promise<"closed">((resolve) => {
      unsubscribe = usePanelStore.subscribe((state, prev) => {
        if (prev.browserOverlayOpen && !state.browserOverlayOpen) resolve("closed");
      });
    });

    try {
      const outcome = await Promise.race([
        readBridge().startUsageLogin({ providerId: id }),
        overlayClosed,
      ]);
      if (outcome === "closed") {
        // Best-effort: tell main to stop the in-flight capture.
        void readBridge()
          .cancelUsageLogin({ providerId: id })
          .catch(() => {});
        return;
      }
      // Dismiss the overlay once the login completes.
      usePanelStore.getState().setBrowserOverlayOpen(false);
      if (!outcome.ok) return;
      // Mark the session stored so the UI reads as signed in immediately,
      // independent of whether the usage fetch below yields displayable data.
      useUsageLoginStateStore.getState().setStored(id, true);
      await mergeFreshSnapshot();
    } finally {
      unsubscribe();
      setSigningIn(false);
    }
  };

  const handleSubmitApiKey = async () => {
    const key = apiKey.trim();
    if (!key || signingIn) return;
    setSigningIn(true);
    try {
      const outcome = await readBridge().submitUsageApiKey({ providerId: id, apiKey: key });
      if (!outcome.ok) return;
      setApiKey("");
      useUsageLoginStateStore.getState().setStored(id, true);
      await mergeFreshSnapshot();
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await readBridge().clearUsageLogin({ providerId: id });
      useUsageLoginStateStore.getState().setStored(id, false);
      await mergeFreshSnapshot();
    } finally {
      setSigningOut(false);
    }
  };

  return {
    supportsLogin,
    canSignIn,
    canBrowserSignIn,
    canApiKeySignIn,
    canSignOut,
    signingIn,
    signingOut,
    apiKey,
    setApiKey,
    handleSignIn,
    handleSubmitApiKey,
    handleSignOut,
  };
}
