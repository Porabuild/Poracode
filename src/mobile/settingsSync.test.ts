import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import type { SharedSettingsInput } from "@/shared/settings";
import type { RemoteDesktopClient } from "@/shared/remote/client";

// applyDesktopSettings mirrors into the shared store; stub it so these tests
// exercise only the push-ordering state machine.
const h = vi.hoisted(() => ({
  applyExternalSharedSettings: vi.fn<() => void>(),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  applyExternalSharedSettings: h.applyExternalSharedSettings,
}));

import {
  applyDesktopSettings,
  pushDesktopSettingsDiff,
  resetDesktopSettings,
} from "./settingsSync";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Only titleGenProvider differs across the pushes; every other remote key stays
// undefined on both sides, so settingChanged() reports no diff for them.
const settings = (provider: string): RemoteSettings =>
  ({ titleGenProvider: provider }) as unknown as RemoteSettings;
const input = (provider: string): SharedSettingsInput =>
  ({ titleGenProvider: provider }) as unknown as SharedSettingsInput;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pushDesktopSettingsDiff push ordering", () => {
  beforeEach(() => {
    resetDesktopSettings();
    h.applyExternalSharedSettings.mockClear();
  });

  it("hydrates the desktop's persistent composer MCP toggles", () => {
    const remote = {
      ...settings("v0"),
      enabledMcpServers: { browser: true, crossagents: false, "computer-use": true },
      disabledBuiltInMcpServers: { chrome: true },
    } as RemoteSettings;

    applyDesktopSettings(remote);

    expect(h.applyExternalSharedSettings).toHaveBeenCalledWith(remote);
  });

  it("forwards a persistent composer MCP toggle change to the desktop", async () => {
    applyDesktopSettings({
      ...settings("v0"),
      enabledMcpServers: { browser: true, crossagents: false },
      disabledBuiltInMcpServers: {},
    } as RemoteSettings);
    const committed = {
      ...settings("v0"),
      enabledMcpServers: { browser: true, crossagents: true },
      disabledBuiltInMcpServers: {},
    } as RemoteSettings;
    const updateSettings = vi.fn<(patch: RemoteSettingsPatch) => Promise<RemoteSettings>>(
      async () => committed,
    );
    const client = { updateSettings } as unknown as RemoteDesktopClient;

    pushDesktopSettingsDiff(client, {
      ...input("v0"),
      enabledMcpServers: committed.enabledMcpServers,
      disabledBuiltInMcpServers: committed.disabledBuiltInMcpServers,
    } as SharedSettingsInput);
    await flush();

    expect(updateSettings).toHaveBeenCalledWith({
      enabledMcpServers: { browser: true, crossagents: true },
    });
  });

  it("an older push's failure does not discard a newer push's committed value", async () => {
    applyDesktopSettings(settings("v0"));

    const first = deferred<RemoteSettings>();
    const second = deferred<RemoteSettings>();
    const updateSettings = vi.fn<(patch: RemoteSettingsPatch) => Promise<RemoteSettings>>(
      async () => settings("committed"),
    );
    updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = { updateSettings } as unknown as RemoteDesktopClient;

    // Two rapid edits → two concurrent pushes.
    pushDesktopSettingsDiff(client, input("v1"));
    pushDesktopSettingsDiff(client, input("v2"));
    expect(updateSettings).toHaveBeenCalledTimes(2);

    // The newer push resolves first and commits its server value…
    second.resolve(settings("v2-server"));
    await flush();
    // …then the OLDER push fails. It must NOT null the snapshot.
    first.reject(new Error("network blip"));
    await flush();

    // Snapshot survived: a further distinct edit still diffs + forwards
    // (a nulled snapshot would early-return and never call updateSettings).
    pushDesktopSettingsDiff(client, input("v3"));
    expect(updateSettings).toHaveBeenCalledTimes(3);
  });

  it("the latest push's failure still invalidates the snapshot", async () => {
    applyDesktopSettings(settings("v0"));

    const only = deferred<RemoteSettings>();
    const updateSettings = vi.fn<(patch: RemoteSettingsPatch) => Promise<RemoteSettings>>(
      async () => settings("committed"),
    );
    updateSettings.mockReturnValueOnce(only.promise);
    const client = { updateSettings } as unknown as RemoteDesktopClient;

    pushDesktopSettingsDiff(client, input("v1"));
    only.reject(new Error("network blip"));
    await flush();

    // Snapshot invalidated → next push has nothing to diff against and no-ops
    // until the next hydration restores the desktop's truth.
    pushDesktopSettingsDiff(client, input("v2"));
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });
});
