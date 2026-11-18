import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { SavedCrew } from "@/shared/crew";
import { defaultSharedSettings } from "@/shared/settings";
import { pickRemoteSettings } from "@/shared/remote";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
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
  let settings = pickRemoteSettings({
    ...defaultSharedSettings,
    crews: [{ ...crew, name: "Remote native" }],
    wslCrews: { Ubuntu: [{ ...crew, name: "Remote Ubuntu" }] },
  });
  const fetch = vi.fn<RemoteFetch>(async (_url, init) => {
    if (init?.body) settings = { ...settings, ...JSON.parse(String(init.body)) };
    return Response.json({ settings });
  });
  const client = new RemoteDesktopClient("https://test.example", "test-token", fetch);
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "crew-desktop",
        connectionId: "crew-connection",
        label: "Remote",
        endpoint: "https://test.example",
        accessToken: "test-token",
        scopes: ["projects:manage"],
      },
    ],
    runtime: { "crew-connection": { status: "online", projects: [], threads: [] } },
    withClient: (_key, run) => run(client),
  });
  const key = "remote:crew-connection/wsl:Ubuntu";
  const view = renderHook(({ scope }) => useCrewLibrary(scope), { initialProps: { scope: key } });
  await waitFor(() => expect(view.result.current.crews[0]?.name).toBe("Remote Ubuntu"));
  act(() => crewLibraryActions(key).setCrewFavorite(crew.id, true));
  await waitFor(() => expect(view.result.current.crews[0]?.favorite).toBe(true));
  expect(settings.crews?.[0]?.favorite).toBeUndefined();
  expect(readCrewLibrary("local")[0]?.name).toBe("Local");
  expect(readCrewLibrary("local/wsl:Ubuntu")[0]?.name).toBe("Local Ubuntu");
  expect(readCrewLibrary("remote:crew-connection/wsl:Debian")).toEqual([]);
  view.rerender({ scope: "remote:crew-connection" });
  expect(view.result.current.crews[0]?.name).toBe("Remote native");
});
