import { useState } from "react";
import { type AgentStatus, baseAgentKind } from "@/shared/contracts";
import { runAgentLoginCommand } from "@/renderer/actions/agentLoginActions";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useProviderUsage } from "@/renderer/state/providerUsageStore";
import {
  useHasStoredSession,
  useUsageLoginStateStore,
} from "@/renderer/state/usageLoginStateStore";
import {
  currentWslDistros,
  findProjectForStatus,
  findTerminalAuthMethodForStatus,
  scopeEnvForStatus,
} from "@/renderer/utils/acpRegistryAuth";
import { refreshAndMergeProviderUsage } from "./refreshProviderUsageSnapshot";
import {
  isClaudeUsageProvider,
  needsBrowserSessionForUsage,
  supportsApiKeyLogin,
  supportsBrowserLogin,
} from "./usageProviders";

/**
 * The installed agent whose CLI credential backs this usage provider. Usage
 * collectors read host-side credentials, so the native install is
 * authoritative; a WSL-only install is the fallback.
 */
function useCliAgentStatus(providerId: string): AgentStatus | undefined {
  const kind = baseAgentKind(providerId);
  const native = useAgentStatusesStore((s) => s.agentStatuses.find((st) => st.kind === kind));
  const wsl = useAgentStatusesStore((s) => s.wslAgentStatuses.find((st) => st.kind === kind));
  return native ?? wsl;
}

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
  // OpenCode can report a local Go plan before its browser session is captured,
  // but the usage meters are only available through that web session. Keep the
  // sign-in action visible for the empty-meter state, including a cached snapshot
  // from before the browser session was captured.
  const needsUsageSession =
    !hasStoredSession &&
    needsBrowserSessionForUsage(id) &&
    snapshot?.status === "ok" &&
    snapshot.windows.length === 0;
  const canSignIn =
    supportsLogin &&
    (snapshot?.status !== "ok" || needsUsageSession) &&
    (!hasStoredSession || sessionRejected);
  const canBrowserSignIn = canSignIn && isBrowserLogin;
  const canApiKeySignIn = canSignIn && isApiKeyLogin;
  const canSignOut = supportsLogin && hasStoredSession;
  // The agent CLI's own login is a third, independent sign-in path: run the
  // agent's declared `loginCommand` in the login terminal overlay. Offered
  // alongside browser/API-key login where a provider has those too. Skipped
  // where the card doesn't surface `auth-missing` as "Not signed in".
  const cliAgentStatus = useCliAgentStatus(id);
  const canCliSignIn =
    !isRemote &&
    sessionRejected &&
    !isClaudeUsageProvider(id) &&
    Boolean(cliAgentStatus?.loginCommand);

  const handleCliSignIn = () => {
    if (signingIn || !cliAgentStatus?.loginCommand) return;
    const status = cliAgentStatus;
    const terminalAuthMethod = findTerminalAuthMethodForStatus(status);
    const project = findProjectForStatus(status, useAppStore.getState().projects);
    setSigningIn(true);
    const opened = runAgentLoginCommand({
      label: status.label,
      command: status.loginCommand!,
      ...(terminalAuthMethod?.env ? { env: terminalAuthMethod.env } : {}),
      ...(project ? { project } : {}),
      onCommandComplete: (exitCode) => {
        setSigningIn(false);
        if (exitCode !== 0) return;
        // The agent's detected auth state and the usage snapshot both read the
        // same credential; refresh both so every surface flips together.
        void readBridge()
          .refreshAgentStatuses(currentWslDistros(), {
            agentKinds: [status.kind],
            envs: [scopeEnvForStatus(status)],
          })
          .catch(() => undefined);
        void refreshAndMergeProviderUsage(id);
      },
    });
    if (!opened) setSigningIn(false);
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    // Open the browser-overlay drawer (not maximized) so the login tab renders
    // there. Force-clear maximized in case a prior session left it fullscreen.
    usePanelStore.getState().setBrowserOverlayMaximized(false);
    usePanelStore.getState().setBrowserOverlayOpen(true);

    // Successful capture closes the login tab, which dismisses the overlay when
    // it was the last tab. Treat overlay close as a cancel *signal* only — never
    // as the login outcome — so "Use Session" can still finish sealing the secret
    // and refresh usage afterward. Cancel is a no-op once capture has settled.
    const unsubscribe = usePanelStore.subscribe((state, prev) => {
      if (prev.browserOverlayOpen && !state.browserOverlayOpen) {
        void readBridge()
          .cancelUsageLogin({ providerId: id })
          .catch(() => {});
      }
    });

    try {
      const outcome = await readBridge().startUsageLogin({ providerId: id });
      // Dismiss the overlay once the login completes (no-op if tab cleanup already
      // closed it). Unsubscribe first so this dismiss doesn't re-fire cancel.
      unsubscribe();
      usePanelStore.getState().setBrowserOverlayOpen(false);
      if (!outcome.ok) return;
      // Mark the session stored so the UI reads as signed in immediately,
      // independent of whether the usage fetch below yields displayable data.
      useUsageLoginStateStore.getState().setStored(id, true);
      await refreshAndMergeProviderUsage(id);
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
      await refreshAndMergeProviderUsage(id);
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
      await refreshAndMergeProviderUsage(id);
    } finally {
      setSigningOut(false);
    }
  };

  return {
    supportsLogin,
    canSignIn,
    canBrowserSignIn,
    canApiKeySignIn,
    canCliSignIn,
    canSignOut,
    signingIn,
    signingOut,
    apiKey,
    setApiKey,
    handleSignIn,
    handleCliSignIn,
    handleSubmitApiKey,
    handleSignOut,
  };
}
