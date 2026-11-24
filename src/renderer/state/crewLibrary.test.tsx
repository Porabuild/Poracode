import { toast } from "@heroui/react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SavedCrew } from "@/shared/crew";
import { LOCAL_NATIVE_MACHINE_KEY } from "@/shared/machines";
import { pickRemoteSettings } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import { fakePairedHost } from "@/renderer/testUtils/pairedHost";
import { crewLibraryActions, readCrewLibrary, useCrewLibrary } from "./crewLibrary";
import { useRemoteServersStore } from "./remoteServersStore";
import { useSharedSettings } from "./sharedSettingsStore";

const crew: SavedCrew = {
  id: "same-id",
  name: "Base crew",
  lead: { agentKind: "lead", model: "lead-model" },
  policy: "crew-first",
  roles: [
    {
      id: "reviewer",
      label: "Reviewer",
      selection: { agentKind: "helper", model: "helper-model" },
    },
  ],
};

const localState = useSharedSettings.getState();
const remoteState = useRemoteServersStore.getState();

afterEach(() => {
  cleanup();
  useSharedSettings.setState(localState);
  useRemoteServersStore.setState(remoteState);
});

it("keeps native, remote-native, and remote WSL libraries separate even if their Crew IDs match", async () => {
  useSharedSettings.setState({
    crews: [{ ...crew, name: "Local" }],
    wslCrews: { Ubuntu: [{ ...crew, name: "Local Ubuntu" }] },
  });
  const host = fakePairedHost({
    settings: pickRemoteSettings({
      ...defaultSharedSettings,
      crews: [{ ...crew, name: "Remote native" }],
      wslCrews: { Ubuntu: [{ ...crew, name: "Remote Ubuntu" }] },
    }),
  });
  const key = `remote:${host.connection}/wsl:Ubuntu`;
  const view = renderHook(({ scope }) => useCrewLibrary(scope), { initialProps: { scope: key } });
  await waitFor(() => expect(view.result.current.crews[0]?.name).toBe("Remote Ubuntu"));
  act(() => crewLibraryActions(key).setCrewFavorite(crew.id, true));
  await waitFor(() => expect(view.result.current.crews[0]?.favorite).toBe(true));
  expect(host.settings.crews?.[0]?.favorite).toBeUndefined();
  expect(readCrewLibrary("local")[0]?.name).toBe("Local");
  expect(readCrewLibrary("local/wsl:Ubuntu")[0]?.name).toBe("Local Ubuntu");
  expect(readCrewLibrary(`remote:${host.connection}/wsl:Debian`)).toEqual([]);
  view.rerender({ scope: `remote:${host.connection}` });
  expect(view.result.current.crews[0]?.name).toBe("Remote native");
});

it("saveCrew resolves true once the owner holds the crew, on every machine scope", async () => {
  const local = crewLibraryActions(LOCAL_NATIVE_MACHINE_KEY);
  await expect(local.saveCrew(crew)).resolves.toBe(true);
  expect(readCrewLibrary(LOCAL_NATIVE_MACHINE_KEY)[0]?.id).toBe(crew.id);

  const wslKey = "local/wsl:Ubuntu";
  await expect(crewLibraryActions(wslKey).saveCrew(crew)).resolves.toBe(true);
  expect(readCrewLibrary(wslKey)[0]?.id).toBe(crew.id);

  const host = fakePairedHost({
    settings: pickRemoteSettings({ ...defaultSharedSettings, crews: [] }),
  });
  const remoteKey = `remote:${host.connection}`;
  await expect(crewLibraryActions(remoteKey).saveCrew(crew)).resolves.toBe(true);
  expect(host.writes).toHaveLength(1);
  expect(readCrewLibrary(remoteKey)[0]?.id).toBe(crew.id);
});

it("saveCrew resolves false when the owner cannot hold the crew", async () => {
  // An unknown machine has no owner to write to.
  await expect(crewLibraryActions("nowhere").saveCrew(crew)).resolves.toBe(false);

  // A paired host that cannot be reached: the failure is still reported.
  const host = fakePairedHost({
    settings: pickRemoteSettings({ ...defaultSharedSettings, crews: [] }),
  });
  host.failWrites = true;
  const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
  const remoteKey = `remote:${host.connection}`;
  await expect(crewLibraryActions(remoteKey).saveCrew(crew)).resolves.toBe(false);
  expect(danger).toHaveBeenCalled();
  expect(host.settings.crews).toEqual([]);
  expect(readCrewLibrary(remoteKey)).toEqual([]);
  danger.mockRestore();
});
