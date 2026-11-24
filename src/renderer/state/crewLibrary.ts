import { toast } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { friendlyError } from "@/shared/messages";
import { i18n } from "@/renderer/i18n/i18n";
import {
  MAX_SAVED_CREWS,
  normalizeCrewRoles,
  savedCrewSchema,
  type SavedCrew,
} from "@/shared/crew";
import { LOCAL_NATIVE_MACHINE_KEY, parseMachineKey } from "@/shared/machines";
import {
  editPairedHostSettings,
  readPairedHostSettings,
  usePairedHostSettings,
} from "./pairedHostSettings";
import { useSharedSettings } from "./sharedSettingsStore";

const EMPTY: SavedCrew[] = [];

function scope(key: string) {
  const machine = parseMachineKey(key);
  return {
    valid: machine !== undefined,
    host: machine?.host === "remote" ? machine.desktopId : undefined,
    distro: machine?.env.kind === "wsl" ? machine.env.distro : undefined,
  };
}

export function readCrewLibrary(key: string): SavedCrew[] {
  const { valid, host, distro } = scope(key);
  if (!valid) return EMPTY;
  const doc = host ? readPairedHostSettings(host) : useSharedSettings.getState();
  return (distro ? doc?.wslCrews?.[distro] : doc?.crews) ?? EMPTY;
}

export function crewLibraryActions(key: string) {
  const { valid, host, distro } = scope(key);
  /**
   * Applies a change to the owner's library. A paired-host write settles later
   * and is returned; local writes land at once.
   */
  const mutate = (change: (crews: SavedCrew[]) => SavedCrew[]): Promise<void> | undefined => {
    if (!valid) return undefined;
    if (host) {
      const write = editPairedHostSettings(host, (settings) => {
        const before = (distro ? settings.wslCrews?.[distro] : settings.crews) ?? EMPTY;
        const next = change(before);
        if (next === before) return undefined;
        if (distro && !settings.wslCrews)
          throw new Error(i18n._(msg`Update the remote server first.`));
        if (!distro && !settings.crews)
          throw new Error(i18n._(msg`Update the remote server first.`));
        return distro ? { wslCrews: { ...settings.wslCrews, [distro]: next } } : { crews: next };
      });
      // The toast only reports the failure; the write stays rejected for callers that wait on it.
      void write.catch((error: unknown) => toast.danger(friendlyError(error)));
      return write;
    } else if (distro) {
      const before = useSharedSettings.getState().wslCrews?.[distro] ?? EMPTY;
      const next = change(before);
      if (next !== before) useSharedSettings.getState().setWslCrews(distro, next);
    }
    return undefined;
  };
  const editRow = (id: string, change: (crew: SavedCrew) => SavedCrew) =>
    mutate((crews) =>
      crews.some((crew) => crew.id === id)
        ? crews.map((crew) => (crew.id === id ? change(crew) : crew))
        : crews,
    );
  /**
   * Sends a crew to the owner. A failed paired-host write rejects here, after
   * `mutate` has reported it.
   */
  const sendCrew = (crew: SavedCrew): Promise<void> | undefined => {
    if (key === LOCAL_NATIVE_MACHINE_KEY) {
      useSharedSettings.getState().upsertCrew(crew);
      return undefined;
    }
    const parsed = savedCrewSchema.safeParse(crew);
    if (!parsed.success) return undefined;
    const roles = normalizeCrewRoles(parsed.data.roles);
    if (roles.length === 0) return undefined;
    const updated = { ...parsed.data, roles, updatedAt: Date.now() };
    return mutate((crews) => {
      const exists = crews.some((entry) => entry.id === crew.id);
      if (!exists) return crews.length < MAX_SAVED_CREWS ? [...crews, updated] : crews;
      return crews.map((entry) => (entry.id === crew.id ? { ...entry, ...updated } : entry));
    });
  };
  return {
    upsertCrew(crew: SavedCrew) {
      void sendCrew(crew);
    },
    /** Resolves true once the owner holds the crew, false when it refused the crew or could not be reached. */
    saveCrew(crew: SavedCrew): Promise<boolean> {
      return (sendCrew(crew) ?? Promise.resolve()).then(
        () => readCrewLibrary(key).some((entry) => entry.id === crew.id),
        () => false,
      );
    },
    deleteCrew(id: string) {
      if (key === LOCAL_NATIVE_MACHINE_KEY) return useSharedSettings.getState().deleteCrew(id);
      void mutate((crews) =>
        crews.some((entry) => entry.id === id) ? crews.filter((entry) => entry.id !== id) : crews,
      );
    },
    setCrewFavorite(id: string, favorite: boolean) {
      if (key === LOCAL_NATIVE_MACHINE_KEY)
        return useSharedSettings.getState().setCrewFavorite(id, favorite);
      void editRow(id, (crew) => ({ ...crew, favorite }));
    },
    setCrewLastUsedAt(id: string, lastUsedAt: number | null) {
      if (key === LOCAL_NATIVE_MACHINE_KEY)
        return useSharedSettings.getState().setCrewLastUsedAt(id, lastUsedAt);
      void editRow(id, ({ lastUsedAt: _previous, ...crew }) =>
        lastUsedAt === null ? crew : { ...crew, lastUsedAt },
      );
    },
  };
}

export function useCrewLibrary(key = LOCAL_NATIVE_MACHINE_KEY) {
  const { valid, host, distro } = scope(key);
  const local = useSharedSettings((state) =>
    host || !valid ? EMPTY : ((distro ? state.wslCrews?.[distro] : state.crews) ?? EMPTY),
  );
  const remote = usePairedHostSettings(host);
  return {
    crews: host
      ? ((distro ? remote?.settings?.wslCrews?.[distro] : remote?.settings?.crews) ?? EMPTY)
      : local,
    ready:
      valid && (!host || Boolean(distro ? remote?.settings?.wslCrews : remote?.settings?.crews)),
    ...crewLibraryActions(key),
  };
}
