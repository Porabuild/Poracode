import { createServer } from "node:net";
import { DEFAULT_SCOPES, LOOPBACK_HOST } from "../harness/constants.ts";
import type { RealHostHandle } from "../harness/realHost.ts";
import { pairingTokenFromUrl } from "../harness/wireLab.ts";
import { exchangeToken } from "./testClient.ts";
import { ProfileClient } from "./concurrencyProfileClient.ts";

/**
 * Device-credential acquisition and connection fan-out for instrumented
 * clients. The production token-exchange rate limit
 * (`DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT`, 20 / 5 min / client IP) is respected,
 * never bypassed: on HTTP 429 the whole pair→exchange cycle retries until the
 * window resets, and every retry is counted for the run artifact.
 */

/** One-time pairing credentials rotate: issuing a new pairing URL revokes the
 * previously active credential (`RemoteAccessServer.issuePairingUrl`), so a
 * pair → exchange cycle must complete before the next client pairs. */
let pairingTail: Promise<unknown> = Promise.resolve();

export function withExclusivePairing<T>(operation: () => Promise<T>): Promise<T> {
  const run = pairingTail.then(operation, operation);
  pairingTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export interface DeviceCredential {
  readonly accessToken: string;
  readonly throttleRetries: number;
  readonly throttleWaitMs: number;
}

const TOKEN_EXCHANGE_RETRY_MS = 20_000;
const TOKEN_EXCHANGE_DEADLINE_MS = 7 * 60_000;

/** Pairs and exchanges a fresh device credential, serialized across the
 * process and patient across the production rate-limit window. */
export async function acquireDeviceCredential(
  handle: RealHostHandle,
  label: string,
): Promise<DeviceCredential> {
  return withExclusivePairing(async () => {
    const deadline = Date.now() + TOKEN_EXCHANGE_DEADLINE_MS;
    let throttleRetries = 0;
    let throttleWaitMs = 0;
    for (;;) {
      const pairing = await handle.pair();
      const credential = pairingTokenFromUrl(pairing.pairingUrl);
      if (!credential) throw new Error(`${label}: pairing URL carried no token credential.`);
      const token = await exchangeToken(handle.httpBaseUrl, credential, DEFAULT_SCOPES);
      if (token.status === 429) {
        if (Date.now() >= deadline) {
          throw new Error(
            `${label}: token exchange still rate-limited (HTTP 429) after ` +
              `${String(throttleRetries)} retries / ${String(throttleWaitMs)}ms of waits.`,
          );
        }
        throttleRetries += 1;
        throttleWaitMs += TOKEN_EXCHANGE_RETRY_MS;
        await new Promise((resolve) => setTimeout(resolve, TOKEN_EXCHANGE_RETRY_MS));
        continue;
      }
      if (token.status !== 200 || !token.accessToken) {
        throw new Error(`${label}: token exchange failed with status ${String(token.status)}.`);
      }
      return { accessToken: token.accessToken, throttleRetries, throttleWaitMs };
    }
  });
}

/** Opens `size` instrumented connections sharing ONE device credential
 * (1 token exchange per profile; N connections ≠ N devices). Returns the
 * credential facts for the run artifact. Connections stay sequential so ready
 * cursors are monotone across the profile. */
export async function createProfileClients(
  handle: RealHostHandle,
  size: number,
  prefix: string,
  sharedAccessToken?: string | undefined,
): Promise<{ clients: ProfileClient[]; credential: DeviceCredential | null }> {
  const labels = Array.from(
    { length: size },
    (_, index) => `${prefix}-c${String(index + 1).padStart(2, "0")}`,
  );
  const clients: ProfileClient[] = [];
  let credential: DeviceCredential | null = null;
  try {
    for (const label of labels) {
      if (sharedAccessToken === undefined && credential === null) {
        credential = await acquireDeviceCredential(handle, label);
      }
      const accessToken = sharedAccessToken ?? credential?.accessToken;
      if (!accessToken) throw new Error(`${label}: no device credential available`);
      const client = await ProfileClient.create({ handle, label, accessToken });
      if (credential !== null && sharedAccessToken === undefined && clients.length === 0) {
        client.metrics.pairingThrottleRetries = credential.throttleRetries;
        client.metrics.pairingThrottleWaitMs = credential.throttleWaitMs;
      }
      clients.push(client);
    }
  } catch (error) {
    await closeProfileClients(clients);
    throw error;
  }
  return { clients, credential };
}

export async function closeProfileClients(clients: readonly ProfileClient[]): Promise<void> {
  for (const client of clients) await client.close();
}
