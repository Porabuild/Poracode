import { REMOTE_OPERATOR_SCOPES } from "@/shared/remote";

/**
 * Managed loopback credential mechanics: the pairing-token exchange and the
 * per-socket ticket mint, each under a hard abort deadline. The intake owns
 * when these run and what a failure means; this module owns the HTTP shapes,
 * the scope/client declaration, and the typed failures that distinguish
 * "credential is spent" from "the local server failed this attempt".
 */

export interface LoopbackRequestContext {
  readonly fetchImpl: typeof fetch;
  /** Loopback HTTP endpoint (any path resolution only needs an absolute base). */
  readonly base: string;
  /** Hard deadline for one request. */
  readonly timeoutMs: number;
  /** Intake-lifecycle abort (dispose); never a per-attempt retry decision. */
  readonly signal?: AbortSignal;
}

export interface LoopbackTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
}

/** The pairing credential no longer authorizes a session (spent, expired, or
 * rejected by a different server build). Re-acquiring a bootstrap is the only
 * recovery — retrying the same exchange cannot succeed. */
export class LoopbackCredentialExhaustedError extends Error {
  constructor(message = "Loopback pairing credential was rejected.") {
    super(message);
    this.name = "LoopbackCredentialExhaustedError";
  }
}

/** The retained bearer was refused by the ticket mint (rotated/expired): the
 * intake re-exchanges the pairing credential exactly once before escalating. */
export class LoopbackTicketUnauthorizedError extends Error {
  constructor(message = "Loopback ticket mint refused the retained bearer.") {
    super(message);
    this.name = "LoopbackTicketUnauthorizedError";
  }
}

/** A local request exceeded its deadline and was aborted. */
export class LoopbackRequestTimeoutError extends Error {
  constructor(message = "Loopback request exceeded its deadline.") {
    super(message);
    this.name = "LoopbackRequestTimeoutError";
  }
}

export function isLoopbackCredentialExhaustedError(error: unknown): boolean {
  return error instanceof LoopbackCredentialExhaustedError;
}

export function isLoopbackTicketUnauthorizedError(error: unknown): boolean {
  return error instanceof LoopbackTicketUnauthorizedError;
}

async function fetchWithDeadline(
  context: LoopbackRequestContext,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  let abortByDeadline = false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => {
      abortByDeadline = true;
      controller.abort();
    },
    Math.max(1, context.timeoutMs),
  );
  timeout.unref?.();
  const external = context.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await context.fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (abortByDeadline) {
      throw new LoopbackRequestTimeoutError(`Loopback request exceeded ${context.timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener("abort", forwardAbort);
  }
}

/** Exchanges this launch's single-use pairing credential for bearer tokens. */
export async function exchangePairingCredential(
  context: LoopbackRequestContext,
  pairingToken: string,
): Promise<LoopbackTokens> {
  const response = await fetchWithDeadline(context, new URL("/oauth/token", context.base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential: pairingToken,
      // The desktop's own renderer is the loopback OWNER: it takes the full
      // operator scope set so managed `call-*` requests can ride this leg
      // (session:operate, projects:manage, …) — not the viewer set an
      // external phone pairs down to.
      scopes: [...REMOTE_OPERATOR_SCOPES],
      client: { label: "Poracode desktop", deviceType: "desktop" },
    }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new LoopbackCredentialExhaustedError(
      `Pairing exchange refused the credential (${response.status}).`,
    );
  }
  if (!response.ok) throw new Error(`Pairing exchange failed (${response.status}).`);
  const payload = (await response.json()) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  };
  if (typeof payload.accessToken !== "string" || payload.accessToken === "") {
    throw new Error("Pairing exchange returned no access token.");
  }
  return {
    accessToken: payload.accessToken,
    refreshToken: typeof payload.refreshToken === "string" ? payload.refreshToken : null,
  };
}

/** Mints the one-use WebSocket ticket for a bearer token. */
export async function mintLoopbackTicket(
  context: LoopbackRequestContext,
  accessToken: string,
): Promise<string> {
  const response = await fetchWithDeadline(
    context,
    new URL("/api/auth/websocket-ticket", context.base),
    {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 401) {
    throw new LoopbackTicketUnauthorizedError();
  }
  if (!response.ok) throw new Error(`Ticket mint failed (${response.status}).`);
  const payload = (await response.json()) as { ticket?: unknown };
  if (typeof payload.ticket !== "string" || payload.ticket === "") {
    throw new Error("Ticket mint returned no ticket.");
  }
  return payload.ticket;
}
