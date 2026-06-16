import { useEffect, useState } from "react";
import type {
  ProfileCoreStats,
  ProfileDevice,
  ProfileIdentity,
  ProfileStatScope,
  ProfileTokenStats,
} from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

export interface ProfileSelection {
  scope: ProfileStatScope;
  /** Selected device id when scope === "device"; undefined = current device. */
  deviceId?: string;
  /** Account-scoped provider filter; undefined = all accounts. */
  provider?: string;
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
  const [devices, setDevices] = useState<ProfileDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ProfileSelection>({ scope: "device" });
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

  const { scope, deviceId, provider } = selection;
  useEffect(() => {
    let active = true;
    const utcOffsetMinutes = -new Date().getTimezoneOffset();
    const req = {
      utcOffsetMinutes,
      scope,
      ...(deviceId ? { deviceId } : {}),
      ...(provider ? { provider } : {}),
    };
    setCoreLoading(true);
    setTokensLoading(true);
    setError(null);
    // Drop the previous selection's token rollup so the token-weighted sections
    // (StatStrip, Providers, Model usage) fall back to their skeletons instead of
    // briefly showing another account's numbers under the newly selected filter.
    // `core` is kept (it reloads from the fast SQLite tier) so the page chrome -
    // including the account filter itself - stays mounted during the refetch.
    setTokens(null);

    void readBridge()
      .getProfileCoreStats(req)
      .then((result) => {
        if (active) setCore(result);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load profile stats.");
      })
      .finally(() => {
        if (active) setCoreLoading(false);
      });

    void readBridge()
      .getProfileTokenStats(req)
      .then((result) => {
        if (active) setTokens(result);
      })
      .catch(() => {
        // Token rollup is best-effort; the core stats still render.
        if (active) setTokens(null);
      })
      .finally(() => {
        if (active) setTokensLoading(false);
      });

    return () => {
      active = false;
    };
  }, [scope, deviceId, provider]);

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
