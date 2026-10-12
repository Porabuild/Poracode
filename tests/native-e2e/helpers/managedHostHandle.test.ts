import { describe, expect, it } from "vitest";
import type { ManagedAppSession, ManagedCdpClient } from "./managedAppSession.ts";
import { createManagedHostHandle } from "./managedHostHandle.ts";

/**
 * Managed host-handle mapping tests.
 *
 * The handle adapts a managed Electron session to the real-host client
 * contract. These tests pin the production procedure call order and payloads,
 * and the current `RemoteAccessPairingInfo` schema mapping (`pairingUrl`,
 * `pairingExpiresAt`, `localHttpBaseUrl`) so the pairing response shape can
 * never drift silently.
 */

interface PairingResponse {
  status: string;
  pairingUrl?: string;
  localHttpBaseUrl?: string;
  httpBaseUrl?: string;
  pairingExpiresAt?: string;
}

function stubCdp(responses: readonly PairingResponse[]): {
  cdp: ManagedCdpClient;
  calls: Array<{ procedure: string; payload: unknown }>;
} {
  const queue = [...responses];
  const calls: Array<{ procedure: string; payload: unknown }> = [];
  const cdp = {
    invokeProcedure: async (procedure: string, payload?: unknown) => {
      calls.push({ procedure, payload });
      return queue.shift() ?? { status: "starting" };
    },
  } as unknown as ManagedCdpClient;
  return { cdp, calls };
}

function stubSession(overrides?: Partial<ManagedAppSession>): ManagedAppSession {
  return {
    sessionFile: "/tmp/session.json",
    root: "/tmp/session",
    appUrl: "http://127.0.0.1:3100/",
    cdpPort: 9222,
    devServerPort: 3100,
    baseDir: "/tmp/session/base",
    projectDir: "/tmp/session/project",
    outDir: "/tmp/session/out",
    ownerPid: 55,
    appPid: null,
    mode: "mock",
    runtime: { entrypoint: "electron" },
    raw: {},
    ...overrides,
  };
}

describe("createManagedHostHandle", () => {
  it("enables remote access first, then maps the current pairing schema", async () => {
    const { cdp, calls } = stubCdp([
      { status: "ready" },
      {
        status: "ready",
        pairingUrl: "http://127.0.0.1:49410/pair?credential=lc_pair_fixture",
        localHttpBaseUrl: "http://127.0.0.1:49410",
        httpBaseUrl: "https://host.tailnet.ts.net",
        pairingExpiresAt: "2026-09-20T22:00:00.000Z",
      },
      {
        status: "ready",
        pairingUrl: "http://127.0.0.1:49410/pair?credential=lc_pair_fresh",
        pairingExpiresAt: "2026-09-20T23:00:00.000Z",
      },
    ]);
    const handle = await createManagedHostHandle({ cdp, session: stubSession() });

    expect(calls[0]).toEqual({ procedure: "setRemoteAccessEnabled", payload: { enabled: true } });
    expect(calls[1]).toEqual({ procedure: "refreshRemoteAccessPairing", payload: {} });
    expect(handle.mode).toBe("real");
    expect(handle.pid).toBe(55);
    expect(handle.baseDir).toBe("/tmp/session/base");
    expect(handle.profileNamespace).toBe("/tmp/session");
    expect(handle.httpBaseUrl).toBe("http://127.0.0.1:49410");
    expect(handle.wsBaseUrl).toBe("ws://127.0.0.1:49410");
    expect(handle.hostPort).toBe(49410);
    expect(handle.entrypoint).toBe("electron");
    expect(handle.blockers).toEqual([]);

    const pairing = await handle.pair();
    expect(pairing.pairingUrl).toContain("lc_pair_fresh");
    expect(pairing.expiresAt).toBe("2026-09-20T23:00:00.000Z");
  });

  it("prefers the app process pid and derives wss from an https base", async () => {
    const { cdp } = stubCdp([
      { status: "ready" },
      {
        status: "ready",
        pairingUrl: "https://host/pair?credential=lc_pair_fixture",
        localHttpBaseUrl: "https://127.0.0.1:49410",
        pairingExpiresAt: "2026-09-20T22:00:00.000Z",
      },
    ]);
    const handle = await createManagedHostHandle({
      cdp,
      session: stubSession({ appPid: 77 }),
    });
    expect(handle.pid).toBe(77);
    expect(handle.wsBaseUrl).toBe("wss://127.0.0.1:49410");
  });

  it("refuses a remote-access state that never becomes ready", async () => {
    const { cdp } = stubCdp([{ status: "ready" }, { status: "starting" }]);
    await expect(createManagedHostHandle({ cdp, session: stubSession() })).rejects.toThrow(
      "managed remote access did not become ready",
    );
  });

  it("refuses a pairing refresh that loses the ready credential", async () => {
    const { cdp } = stubCdp([
      { status: "ready" },
      {
        status: "ready",
        pairingUrl: "http://127.0.0.1:49410/pair?credential=lc_pair_fixture",
        localHttpBaseUrl: "http://127.0.0.1:49410",
        pairingExpiresAt: "2026-09-20T22:00:00.000Z",
      },
      { status: "starting" },
    ]);
    const handle = await createManagedHostHandle({ cdp, session: stubSession() });
    await expect(handle.pair()).rejects.toThrow("did not return a ready credential");
  });

  it("keeps restart unsupported and stop delegated to the owning launcher", async () => {
    const { cdp } = stubCdp([
      { status: "ready" },
      {
        status: "ready",
        pairingUrl: "http://127.0.0.1:49410/pair?credential=lc_pair_fixture",
        localHttpBaseUrl: "http://127.0.0.1:49410",
        pairingExpiresAt: "2026-09-20T22:00:00.000Z",
      },
    ]);
    const handle = await createManagedHostHandle({ cdp, session: stubSession() });
    await expect(handle.restart()).rejects.toThrow("restart is not supported");
    await expect(handle.stop()).resolves.toBeUndefined();
  });
});
