import { z } from "zod";
import { RemoteClientError, RemoteDesktopClient, type RemoteFetch } from "@/shared/remote/client";
import { remoteAccessTokenResultSchema } from "@/shared/remote";
import { readBoundedResponseBody } from "@/shared/remote/responseBody";
import { msg } from "@/shared/messages";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import { isBrowserExtensionReachableEndpoint } from "@/shared/chromeSidebarProtocol";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import type { RemoteClientFactory, RemoteSocketLike } from "@/renderer/state/remoteServers/types";

const descriptorSchema = z.object({
  version: z.literal(1),
  session: z.string().regex(/^[0-9a-f]{64}$/),
  endpoint: z.string().url(),
});
type Descriptor = z.infer<typeof descriptorSchema>;
type Grant = {
  descriptor: Descriptor;
  credential: string;
  accessToken?: string | undefined;
  // The store keeps its original access token while its refresh vault rotates.
  // Retain only that same-grant token plus the latest rotation, never vault seeds.
  initialAccessToken?: string;
  refreshToken?: string | undefined;
  abort: AbortController;
  tickets: Set<string>;
};

/** Worker replies are bounded and read-only; they never mint a pairing credential. */
export async function sidebarWorkerMessage(cmd: string): Promise<unknown> {
  const runtime = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: { sendMessage(message: { cmd: string }): Promise<unknown> } };
    }
  ).chrome?.runtime;
  if (!runtime) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runtime.sendMessage({ cmd }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function origin(endpoint: string): string {
  const url = new URL(endpoint);
  if (
    !isBrowserExtensionReachableEndpoint(endpoint) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw denied();
  return url.origin;
}
function denied(): RemoteClientError {
  return new RemoteClientError(msg("remote.server.unreachable"), 0, "network");
}

/**
 * One volatile grant per sidebar document. A persisted credential never creates
 * authority: only tokens returned by this grant's pairing/rotation are admitted.
 * Each dispatch rechecks the worker's current proven hello and endpoint. Losing
 * proof permanently retires captured clients, in-flight HTTP and open sockets.
 */
export function createSidebarTransportPolicy(
  ask = sidebarWorkerMessage,
  fetchImpl: RemoteFetch = (url, init) =>
    fetch(url, {
      ...init,
      body: (init?.body as BodyInit) ?? null,
      redirect: "error",
    }),
  openSocket: (url: string) => RemoteSocketLike = (url) =>
    new WebSocket(url) as unknown as RemoteSocketLike,
) {
  let grant: Grant | undefined;
  const sockets = new Set<RemoteSocketLike>();
  const retirementListeners = new Set<() => void>();
  function retire(expected = grant): void {
    if (!expected || grant !== expected) return;
    grant = undefined;
    expected.abort.abort();
    expected.tickets.clear();
    for (const socket of sockets) socket.close();
    sockets.clear();
    for (const listener of retirementListeners) listener();
  }
  async function descriptor(): Promise<Descriptor | undefined> {
    const parsed = descriptorSchema.safeParse(await ask("getChatConnection"));
    if (!parsed.success) return undefined;
    origin(parsed.data.endpoint);
    return parsed.data;
  }
  async function check(expected: Grant | undefined): Promise<void> {
    if (!expected || grant !== expected) throw denied();
    try {
      const current = await descriptor();
      if (
        grant !== expected ||
        !current ||
        current.session !== expected.descriptor.session ||
        origin(current.endpoint) !== origin(expected.descriptor.endpoint)
      )
        throw denied();
    } catch {
      retire(expected);
      throw denied();
    }
  }
  const client: RemoteClientFactory = (endpoint, accessToken) => {
    const captured = grant;
    // Admission is captured at construction: a previously restored client can
    // never acquire authority when some later pairing succeeds.
    const admitted =
      !!captured &&
      origin(endpoint) === origin(captured.descriptor.endpoint) &&
      (accessToken === undefined ||
        accessToken === captured.accessToken ||
        accessToken === captured.initialAccessToken);
    const guardedFetch: RemoteFetch = async (url, init) => {
      if (!admitted || !captured) throw denied();
      const request = new URL(url);
      if (request.origin !== origin(captured.descriptor.endpoint)) throw denied();
      const oauth = request.pathname === "/oauth/token";
      if (oauth) {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "null");
        if (
          !(
            body?.grantType === "pairing-token" &&
            !accessToken &&
            body.credential === captured.credential
          ) &&
          !(
            body?.grantType === "refresh_token" &&
            captured.refreshToken &&
            body.refreshToken === captured.refreshToken
          )
        )
          throw denied();
      } else if (!accessToken) throw denied();
      await check(captured);
      if (grant !== captured || init?.signal?.aborted) throw denied();
      const response = await fetchImpl(url, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, captured.abort.signal])
          : captured.abort.signal,
      });
      // A response crossing retirement cannot publish credentials or a ticket.
      if (grant !== captured) throw denied();
      if (response.ok && (oauth || request.pathname === "/api/auth/websocket-ticket")) {
        const bytes = await readBoundedResponseBody(response.clone(), 64 * 1024);
        const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (grant !== captured) throw denied();
        if (oauth) {
          const tokens = remoteAccessTokenResultSchema.parse(data);
          captured.initialAccessToken ??= tokens.accessToken;
          captured.accessToken = tokens.accessToken;
          captured.refreshToken = tokens.refreshToken;
          captured.credential = "";
        } else {
          const result = z.object({ ticket: z.string().min(1) }).parse(data);
          if (captured.tickets.size >= 32)
            captured.tickets.delete(captured.tickets.values().next().value!);
          captured.tickets.add(result.ticket);
        }
      }
      return response;
    };
    return new RemoteDesktopClient(endpoint, accessToken, guardedFetch);
  };
  return {
    client,
    /** Current record selection is narrower than a cached online flag. */
    isAuthorized(endpoint: string, accessToken: string): boolean {
      try {
        return (
          !!grant &&
          origin(endpoint) === origin(grant.descriptor.endpoint) &&
          !!accessToken &&
          (accessToken === grant.initialAccessToken || accessToken === grant.accessToken)
        );
      } catch {
        return false;
      }
    },
    onRetire(listener: () => void): () => void {
      retirementListeners.add(listener);
      return () => {
        retirementListeners.delete(listener);
      };
    },
    async socket(url: string): Promise<RemoteSocketLike> {
      const captured = grant;
      const target = new URL(url);
      const ticket = target.searchParams.get("ticket");
      target.protocol = "http:";
      if (
        !captured ||
        target.origin !== origin(captured.descriptor.endpoint) ||
        !ticket ||
        !captured.tickets.delete(ticket)
      )
        throw denied();
      await check(captured);
      if (grant !== captured) throw denied();
      for (const previous of sockets) if (previous.readyState === 3) sockets.delete(previous);
      const socket = openSocket(url);
      sockets.add(socket);
      // Keep only live sockets; registry close retains its existing semantics.
      const close = socket.close.bind(socket);
      socket.close = () => {
        sockets.delete(socket);
        close();
      };
      return socket;
    },
    async authorize(bootstrap: ManagedLoopbackBootstrap): Promise<void> {
      retire();
      const current = await descriptor();
      const pairing = parsePairingUrlParts(bootstrap.pairingUrl);
      if (
        !current ||
        origin(current.endpoint) !== origin(bootstrap.endpoint) ||
        !pairing ||
        origin(pairing.url.origin) !== origin(bootstrap.endpoint)
      )
        throw denied();
      grant = {
        descriptor: current,
        credential: pairing.token,
        abort: new AbortController(),
        tickets: new Set(),
      };
    },
    async isCurrent(): Promise<boolean> {
      if (!grant) return false;
      try {
        await check(grant);
        return true;
      } catch {
        return false;
      }
    },
    retire,
  };
}
