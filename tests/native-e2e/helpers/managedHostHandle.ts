import type { RealHostHandle } from "../harness/realHost.ts";
import type { PairingControlResponse } from "../harness/types.ts";
import type { ManagedAppSession, ManagedCdpClient } from "./managedAppSession.ts";

/**
 * Adapts a managed Electron session to the existing `RealHostHandle` contract
 * so the instrumented native-e2e clients (ProfileClient, credential exchange,
 * profile metrics) run unchanged against the real managed app.
 *
 * Pairing is minted through the app's own production procedure
 * (`refreshRemoteAccessPairing`); remote access must be user-enabled first,
 * which is also a production procedure (`setRemoteAccessEnabled`). Pairing
 * URLs carry credentials and are never logged.
 */

interface RemoteAccessPairingInfo {
  readonly status?: unknown;
  readonly pairingUrl?: unknown;
  readonly localHttpBaseUrl?: unknown;
  readonly httpBaseUrl?: unknown;
  /** Current wire schema field (`remoteAccessPairingInfoSchema.status === "ready"`). */
  readonly pairingExpiresAt?: unknown;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;

export async function createManagedHostHandle(input: {
  readonly cdp: ManagedCdpClient;
  readonly session: ManagedAppSession;
}): Promise<RealHostHandle> {
  await input.cdp.invokeProcedure("setRemoteAccessEnabled", { enabled: true });
  const info = (await input.cdp.invokeProcedure(
    "refreshRemoteAccessPairing",
    {},
  )) as RemoteAccessPairingInfo;
  const pairingUrl = typeof info.pairingUrl === "string" ? info.pairingUrl : null;
  const base =
    typeof info.localHttpBaseUrl === "string"
      ? info.localHttpBaseUrl
      : typeof info.httpBaseUrl === "string"
        ? info.httpBaseUrl
        : null;
  if (info.status !== "ready" || pairingUrl === null || base === null) {
    throw new Error(
      `managed remote access did not become ready (status=${String(info.status)}, ` +
        `pairingUrl=${pairingUrl === null ? "missing" : "present"}, base=${base === null ? "missing" : "present"})`,
    );
  }
  const parsed = new URL(base);
  const wsBaseUrl = `${parsed.protocol === "https:" ? "wss" : "ws"}://${parsed.host}`;
  const hostPort = Number(parsed.port);

  const mintPairing = async (): Promise<PairingControlResponse> => {
    const fresh = (await input.cdp.invokeProcedure(
      "refreshRemoteAccessPairing",
      {},
    )) as RemoteAccessPairingInfo;
    if (fresh.status !== "ready" || typeof fresh.pairingUrl !== "string") {
      throw new Error(`managed pairing refresh did not return a ready credential`);
    }
    return {
      pairingUrl: fresh.pairingUrl,
      expiresAt:
        typeof fresh.pairingExpiresAt === "string"
          ? fresh.pairingExpiresAt
          : new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
    };
  };

  return {
    mode: "real",
    get pid() {
      return input.session.appPid ?? input.session.ownerPid;
    },
    get baseDir() {
      return input.session.baseDir;
    },
    get profileNamespace() {
      return input.session.root;
    },
    get httpBaseUrl() {
      return base;
    },
    get wsBaseUrl() {
      return wsBaseUrl;
    },
    get hostPort() {
      return hostPort;
    },
    get entrypoint() {
      const runtimeEntry = input.session.runtime?.entrypoint;
      return typeof runtimeEntry === "string" ? runtimeEntry : "managed-electron";
    },
    get blockers() {
      return [];
    },
    pair: mintPairing,
    restart: async () => {
      throw new Error(
        "managed session restart is not supported inside a qualification cell; stop and relaunch",
      );
    },
    stop: async () => {
      // Teardown is owned by the skill launcher; the cell's afterAll calls it.
    },
  };
}
