import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type {
  ProfileCoreStats,
  ProfileDevice,
  ProfileIdentity,
  ProfileStatScope,
  ProfileStatsWindow,
  ProfileTokenStats,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export interface ProfileSelection {
  scope: ProfileStatScope;
  /** Selected device id when scope === "device"; undefined = current device. */
  deviceId?: string;
  /** Account-scoped provider filter; undefined = all accounts. */
  provider?: string;
  window: ProfileStatsWindow;
}

export interface ProfileData {
  devices: ProfileDevice[];
  currentDeviceId: string | null;
  selection: ProfileSelection;
  setSelection: (selection: ProfileSelection) => void;
  core: ProfileCoreStats | null;
  coreLoading: boolean;
  tokens: ProfileTokenStats | null;
  tokensLoading: boolean;
  error: string | null;
  /** Optimistically apply an identity edit and persist it. */
  saveIdentity: (identity: ProfileIdentity) => Promise<void>;
}

/**
 * Fetches the profile in two tiers so the page paints instantly: core stats
 * first, token rollups in the background. The device list + `selection` drive
 * the per-device view - today only the current device resolves to local data;
 * Cloud will populate the rest.
 */
export function useProfileData(): ProfileData {
  const { t } = useLingui();
  const [devices, setDevices] = useState<ProfileDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ProfileSelection>({ scope: "device", window: "all" });
  const [core, setCore] = useState<ProfileCoreStats | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [tokens, setTokens] = useState<ProfileTokenStats | null>(null);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Device list is independent of the selected scope - fetch once.
  useEffect(() => {
    let active = true;
    void readBridge()
      .getProfileDevices()
      .then((result) => {
        if (!active) return;
        setDevices(result.devices);
        setCurrentDeviceId(result.currentDeviceId);
      })
      .catch(() => {
        if (active) setDevices([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const { scope, deviceId, provider, window } = selection;
  // The locale translator changes identity per language, and the old effect
  // refetched on it — fold it into the request key so the locale stays a
  // genuine (consumed) input instead of a trigger-only dependency.
  const locale = useSharedSettings((state) => state.locale);
  const statsRequestKey = `${scope}\0${deviceId ?? ""}\0${provider ?? ""}\0${window}\0${locale}`;
  const activeStatsKeyRef = useRef(statsRequestKey);
  // Reset-on-selection-change during render (mirrors the synchronous resets
  // the effect used to do on entry). Starts as null so the mount pass applies
  // it too — the old effect ran on mount and set the same values.
  const [prevStatsKey, setPrevStatsKey] = useState<string | null>(null);
  if (prevStatsKey !== statsRequestKey) {
    setPrevStatsKey(statsRequestKey);
    setCoreLoading(true);
    setTokensLoading(true);
    setError(null);
    // Drop the previous selection's token rollup so the token-weighted sections
    // (StatStrip, Providers, Model usage) fall back to their skeletons instead of
    // briefly showing another account's numbers under the newly selected filter.
    // `core` is kept (it reloads from the fast SQLite tier) so the page chrome -
    // including the account filter itself - stays mounted during the refetch.
    setTokens(null);
  }
  useEffect(() => {
    activeStatsKeyRef.current = statsRequestKey;
    let active = true;
    const capturedKey = statsRequestKey;
    const keyFresh = () => active && activeStatsKeyRef.current === capturedKey;
    const utcOffsetMinutes = -new Date().getTimezoneOffset();
    const req = {
      utcOffsetMinutes,
      scope,
      window,
      ...(deviceId ? { deviceId } : {}),
      ...(provider ? { provider } : {}),
    };

    void readBridge()
      .getProfileCoreStats(req)
      .then((result) => {
        if (keyFresh()) setCore(result);
      })
      .catch((err: unknown) => {
        if (keyFresh())
          setError(err instanceof Error ? err.message : t`Failed to load profile stats.`);
      })
      .finally(() => {
        if (keyFresh()) setCoreLoading(false);
      });

    void readBridge()
      .getProfileTokenStats(req)
      .then((result) => {
        if (keyFresh()) setTokens(result);
      })
      .catch(() => {
        // Token rollup is best-effort; the core stats still render.
        if (keyFresh()) setTokens(null);
      })
      .finally(() => {
        if (keyFresh()) setTokensLoading(false);
      });

    return () => {
      active = false;
    };
  }, [scope, deviceId, provider, window, statsRequestKey, t]);

  async function saveIdentity(identity: ProfileIdentity): Promise<void> {
    const response = await readBridge().setProfileIdentity(identity);
    setCore((prev) => (prev ? { ...prev, identity: response.identity } : prev));
  }

  return {
    devices,
    currentDeviceId,
    selection,
    setSelection,
    core,
    coreLoading,
    tokens,
    tokensLoading,
    error,
    saveIdentity,
  };
}
