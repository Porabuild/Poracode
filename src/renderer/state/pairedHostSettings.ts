import { useEffect } from "react";
import { msg } from "@lingui/core/macro";
import { create } from "zustand";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import { i18n } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "./sharedSettingsStore";
import { currentRemoteServerGeneration } from "./remoteServers/eventSocketRegistry";
import { remoteConnectionKey } from "./remoteServers/types";
import { useRemoteServersStore } from "./remoteServersStore";

type Entry = {
  generation: number;
  settings?: RemoteSettings;
  error?: unknown;
};

const useDocuments = create<Record<string, Entry>>(() => ({}));
const pendingReads = new Map<string, Promise<void>>();
const pendingWrites = new Map<string, Promise<void>>();

function online(key: string, generation: number) {
  const state = useRemoteServersStore.getState();
  return (
    generation === currentRemoteServerGeneration(key) &&
    state.runtime[key]?.status === "online" &&
    state.servers.some((server) => remoteConnectionKey(server) === key)
  );
}

function publish(key: string, entry: Entry) {
  if (online(key, entry.generation)) useDocuments.setState({ [key]: entry });
}

export function refreshPairedHostSettings(key: string, generation: number): void {
  const pendingKey = JSON.stringify([key, generation]);
  if (!online(key, generation) || pendingReads.has(pendingKey)) return;
  const existingWrite = pendingWrites.get(key);
  const request = (existingWrite ?? Promise.resolve())
    .then(() => useRemoteServersStore.getState().withClient(key, (client) => client.settings()))
    .then(
      (settings) => publish(key, { generation, settings }),
      (error: unknown) => publish(key, { generation, error }),
    )
    .finally(() => {
      pendingReads.delete(pendingKey);
    });
  pendingReads.set(pendingKey, request);
}

export function usePairedHostSettings(key: string | undefined): Entry | undefined {
  const generation = key ? currentRemoteServerGeneration(key) : 0;
  const status = useRemoteServersStore((s) => (key ? s.runtime[key]?.status : undefined));
  const entry = useDocuments((s) => (key ? s[key] : undefined));
  useEffect(() => {
    if (key && status === "online") refreshPairedHostSettings(key, generation);
  }, [key, generation, status]);
  return status === "online" && entry?.generation === generation ? entry : undefined;
}

/** Compose deltas against the owner's current document, not a UI projection. */
export function editPairedHostSettings(
  key: string,
  edit: (current: RemoteSettings) => RemoteSettingsPatch | undefined,
): Promise<void> {
  const generation = currentRemoteServerGeneration(key);
  const queued = Promise.all([
    pendingWrites.get(key),
    pendingReads.get(JSON.stringify([key, generation])),
  ]);
  const assertCurrent = () => {
    if (!online(key, generation)) throw new Error(i18n._(msg`Connection failed.`));
  };
  const next = queued.then(async () => {
    assertCurrent();
    await useRemoteServersStore.getState().withClient(key, async (client) => {
      assertCurrent();
      const before = await client.settings();
      assertCurrent();
      const patch = edit(before);
      const settings = patch ? await client.updateSettings(patch) : before;
      publish(key, { generation, settings });
    });
  });
  const settled = next
    .catch(() => undefined)
    .finally(() => {
      if (pendingWrites.get(key) === settled) pendingWrites.delete(key);
    });
  pendingWrites.set(key, settled);
  return next;
}

export function readPairedHostSettings(key: string): RemoteSettings | undefined {
  const entry = useDocuments.getState()[key];
  return entry && online(key, entry.generation) ? entry.settings : undefined;
}

/** Missing or offline host data must not inherit another machine's preferences. */
export function useHostSetting<
  Key extends keyof RemoteSettings & keyof typeof defaultSharedSettings,
>(connectionKey: string | undefined, field: Key) {
  const local = useSharedSettings((settings) => settings[field]);
  const remote = usePairedHostSettings(connectionKey);
  return connectionKey ? (remote?.settings?.[field] ?? defaultSharedSettings[field]) : local;
}
