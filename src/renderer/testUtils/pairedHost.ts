import type { RemoteSettings } from "@/shared/remote";
import { RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import type { AgentStatus } from "@/shared/contracts";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";

export type FakePairedHost = {
  /** Connection key of the paired host, for `remote:<connection>` machine keys. */
  readonly connection: string;
  /** The host's settings. A write merges into them unless it fails. */
  settings: RemoteSettings;
  /** Makes every settings write fail, as an unreachable host would. */
  failWrites: boolean;
  /** When set, each settings write waits for this promise before the host handles it. */
  writeGate: Promise<unknown> | undefined;
  /** Request bodies of the settings writes the host has received, accepted or not. */
  readonly writes: string[];
  /** Marks the host offline in the store, as the connection monitor does when it stops answering. */
  drop(): void;
};

let nextHostId = 0;

/**
 * Registers one online paired host whose settings live in memory, so a test can
 * read and edit a paired host's settings without a network. Every call is a
 * distinct host, so cached documents never leak between tests. Restore
 * `useRemoteServersStore` afterwards.
 */
export function fakePairedHost(options: {
  settings: RemoteSettings;
  agentStatuses?: readonly AgentStatus[];
}): FakePairedHost {
  const host: FakePairedHost = {
    connection: `paired-test-connection-${++nextHostId}`,
    settings: options.settings,
    failWrites: false,
    writeGate: undefined,
    writes: [],
    drop() {
      const runtime = useRemoteServersStore.getState().runtime[host.connection];
      if (!runtime) throw new Error("The fake paired host has no connection state.");
      useRemoteServersStore.setState((state) => ({
        runtime: { ...state.runtime, [host.connection]: { ...runtime, status: "offline" } },
      }));
    },
  };
  const fetch: RemoteFetch = async (_url, init) => {
    if (typeof init?.body !== "string") return Response.json({ settings: host.settings });
    host.writes.push(init.body);
    if (host.writeGate) await host.writeGate;
    if (host.failWrites) throw new Error("The paired host is unreachable.");
    host.settings = { ...host.settings, ...JSON.parse(init.body) };
    return Response.json({ settings: host.settings });
  };
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "paired-test-desktop",
        connectionId: host.connection,
        label: "Paired test host",
        endpoint: "https://paired.test.example",
        accessToken: "test-token",
        scopes: ["projects:manage"],
      },
    ],
    runtime: {
      [host.connection]: {
        status: "online",
        projects: [],
        threads: [],
        ...(options.agentStatuses
          ? {
              agentStatuses: {
                windows: [...options.agentStatuses],
                wsl: [],
                updatedAt: new Date(0).toISOString(),
              },
            }
          : {}),
      },
    },
    withClient: (_key, run) =>
      run(new RemoteDesktopClient("https://paired.test.example", "test-token", fetch)),
  });
  return host;
}
