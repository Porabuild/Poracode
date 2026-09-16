import { randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import {
  authenticateHostControlRequest,
  createHostControlRequestProof,
  createHostControlResponseProof,
  verifyHostControlResponse,
} from "./hostControlAuth";
import { readHostOwnerRecord, type HostOwnerLease } from "./hostOwnerLease";
import type { HostRootPaths } from "./hostRootPaths";
import { readPrivateHostFile } from "./privateHostFile";
import { getOwnedSecretStorageKey, type NativeSecretCodec } from "./ownedSecretKey";

export type { NativeSecretCodec } from "./ownedSecretKey";

/**
 * Controller-owned OS-sealed key initialization for Electron-backed owners.
 * The lease fences every native byte transform (see `ownedSecretKey.ts`);
 * this facade is the desktop-composition entry for the safe-storage key
 * lifecycle instead of ad-hoc key-file access in the main process.
 */
export function getNativeSecretStorageKey(
  lease: HostOwnerLease,
  codec: NativeSecretCodec,
): Promise<string> {
  return getOwnedSecretStorageKey(lease, { mode: "os-sealed", codec });
}

/**
 * One-time Electron-cooperation protocol for credential adoption (Gate 2.5
 * S5.1). A staged offline import sealed with the desktop OS-backed key cannot
 * be unsealed headlessly: safeStorage only decrypts for the desktop app that
 * sealed it. The desktop owner answers exactly one authenticated loopback
 * request per process lifetime, unsealing the staged key blob so the headless
 * owner can adopt its key material under its own lease. Nothing else crosses
 * the boundary — no credential payload, no key-file path — and the desktop
 * never writes the staged root. The transport reuses the existing local
 * control/pairing boundary discipline (IPv4 loopback peer only, private
 * bounded discovery file, the same HMAC request/response proof scheme and
 * input deadlines) with a versioned, purpose-scoped request instead of
 * extending the closed describe/pairing wire.
 */

export const HOST_KEY_ADOPTION_PROTOCOL_VERSION = 1;
export const HOST_KEY_ADOPTION_OFFER_VERSION = 1;
export const HOST_KEY_ADOPTION_OFFER_FILE = "host-key-adoption.json";
/** Matches the sealed key-blob bound used everywhere for secret-key files. */
export const HOST_KEY_ADOPTION_MAX_SEALED_BYTES = 16_384;
const MAX_OFFER_BYTES = 4_096;
const OFFER_TTL_MS = 5 * 60_000;
const MAX_REQUEST_BYTES = HOST_KEY_ADOPTION_MAX_SEALED_BYTES + 2_048;
const MAX_RESPONSE_BYTES = 16_384;
const INPUT_DEADLINE_MS = 2_000;
const DEFAULT_ADOPTION_TIMEOUT_MS = 5_000;

const ENCODED_32_BYTES = /^[A-Za-z0-9_-]{43}$/u;
const SEALED_KEY_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/u;
const rootSchema = z.string().min(1).max(4_096);

function isBase64Url32(value: unknown): value is string {
  return typeof value === "string" && ENCODED_32_BYTES.test(value);
}

function isValidSealedKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= HOST_KEY_ADOPTION_MAX_SEALED_BYTES &&
    SEALED_KEY_SHAPE.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function isValidKeyMaterial(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && Buffer.from(value, "base64").length === 32
  );
}

export interface HostKeyAdoptionOffer {
  readonly formatVersion: typeof HOST_KEY_ADOPTION_OFFER_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly ownerGeneration: string;
  readonly transport: { readonly kind: "http-loopback"; readonly port: number };
  readonly token: string;
  readonly nonce: string;
  readonly createdAt: string;
}

function offerPath(paths: HostRootPaths): string {
  return join(paths.dataRoot, HOST_KEY_ADOPTION_OFFER_FILE);
}

/**
 * Read and validate the desktop owner's one-time adoption offer. The file is
 * owner-private (0600, unlinked, size-bounded), bound to the live owner
 * record, and expires quickly: a stale file can never authenticate anything.
 */
export function readHostKeyAdoptionOffer(
  paths: HostRootPaths,
  options: { now?(): number } = {},
): HostKeyAdoptionOffer {
  const now = options.now ? options.now() : Date.now();
  let offer: HostKeyAdoptionOffer;
  try {
    const bytes = readPrivateHostFile(paths, HOST_KEY_ADOPTION_OFFER_FILE, MAX_OFFER_BYTES);
    offer = JSON.parse(bytes.toString("utf8")) as HostKeyAdoptionOffer;
  } catch {
    throw new Error(
      "No Poracode desktop owner is currently offering key adoption for this profile.",
    );
  }
  const owner = readHostOwnerRecord(paths);
  if (
    offer.formatVersion !== HOST_KEY_ADOPTION_OFFER_VERSION ||
    offer.profileNamespace !== paths.profileNamespace ||
    offer.dataRoot !== paths.dataRoot ||
    !owner ||
    owner.phase === "stopped" ||
    offer.ownerGeneration !== owner.generation ||
    offer.transport?.kind !== "http-loopback" ||
    !Number.isSafeInteger(offer.transport.port) ||
    offer.transport.port < 1 ||
    offer.transport.port > 65_535 ||
    !isBase64Url32(offer.token) ||
    !isBase64Url32(offer.nonce) ||
    typeof offer.createdAt !== "string" ||
    !Number.isFinite(Date.parse(offer.createdAt)) ||
    now - Date.parse(offer.createdAt) > OFFER_TTL_MS ||
    now < Date.parse(offer.createdAt) - 1_000
  ) {
    throw new Error("The Poracode key-adoption offer is invalid or expired.");
  }
  return offer;
}

function removeOfferFile(paths: HostRootPaths, ownerGeneration: string): void {
  try {
    if (readHostKeyAdoptionOffer(paths).ownerGeneration !== ownerGeneration) return;
  } catch {
    return; // Nothing of ours (or anything at all) left to remove.
  }
  try {
    unlinkSync(offerPath(paths));
  } catch {
    /* Expiry and one-shot binding make a leftover offer harmless. */
  }
}

const adoptionRequestSchema = z.strictObject({
  version: z.literal(HOST_KEY_ADOPTION_PROTOCOL_VERSION),
  requestId: z.uuid(),
  nonce: z.string().refine(isBase64Url32, "Invalid adoption nonce."),
  profileNamespace: rootSchema,
  dataRoot: rootSchema,
  sealedKey: z.string().refine(isValidSealedKey, "Invalid sealed key bytes."),
});

type AdoptionErrorCode = "invalid-request" | "profile-mismatch" | "already-served" | "unavailable";

interface AdoptionRequest {
  readonly requestId: string;
  readonly nonce: string;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly sealedKey: string;
}

type AdoptionOutcome =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly code: AdoptionErrorCode };

interface AdoptionResult {
  readonly requestId: string;
  readonly outcome: AdoptionOutcome;
}

const adoptionSuccessSchema = z.strictObject({
  version: z.literal(HOST_KEY_ADOPTION_PROTOCOL_VERSION),
  requestId: z.uuid(),
  ownerGeneration: z.uuid(),
  ok: z.literal(true),
  key: z.string().refine(isValidKeyMaterial, "Invalid adopted key material."),
});

const adoptionRefusalSchema = z.strictObject({
  version: z.literal(HOST_KEY_ADOPTION_PROTOCOL_VERSION),
  requestId: z.uuid(),
  ownerGeneration: z.uuid(),
  ok: z.literal(false),
  code: z.enum(["invalid-request", "profile-mismatch", "already-served", "unavailable"]),
});

export interface HostCredentialAdoptionServiceOptions {
  lease: HostOwnerLease;
  /**
   * The native unseal engine (Electron safeStorage in production). It receives
   * the sealed blob and the owner generation to transform; never a file path.
   */
  unseal(sealedKey: string, ownerGeneration: string): Promise<string>;
  reportError?(error: unknown): void;
}

/**
 * The desktop side of the adoption protocol. Publishes a one-time offer file
 * and answers at most one successful unseal for its own live owner
 * generation; the offer is retired on that first answered request and on
 * dispose. Mount alongside the desktop control server while an activation
 * may be pending (see docs/HOST_OWNERSHIP.md); it is additive and never
 * required for ordinary desktop operation.
 */
export class HostCredentialAdoptionService {
  private readonly generation: string;
  private readonly token = randomBytes(32).toString("base64url");
  private readonly nonce = randomBytes(32).toString("base64url");
  private readonly connections: HttpServerConnections;
  private starting: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private stopping = false;
  private served = false;
  private port: number | undefined;
  private readonly server = createServer(
    { maxHeaderSize: 4_096 },
    (request, response) => void this.handle(request, response).catch(() => response.destroy()),
  );

  constructor(private readonly options: HostCredentialAdoptionServiceOptions) {
    options.lease.assertActive();
    this.generation = options.lease.generation;
    this.connections = new HttpServerConnections(this.server);
    this.server.maxConnections = 2;
    this.server.maxRequestsPerSocket = 1;
    this.server.on("upgrade", (_, socket) => socket.destroy());
    this.server.on("clientError", (_, socket) => socket.destroy());
  }

  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error("Key adoption is stopping."));
    if (this.starting) return this.starting;
    const barrier = Promise.withResolvers<void>();
    this.starting = barrier.promise;
    this.server.once("error", barrier.reject);
    try {
      this.options.lease.assertActive(this.generation);
      this.server.listen(0, "127.0.0.1", () => {
        try {
          const address = this.server.address();
          if (!address || typeof address === "string")
            throw new Error("Key adoption listen failed.");
          this.port = address.port;
          const offer: HostKeyAdoptionOffer = {
            formatVersion: HOST_KEY_ADOPTION_OFFER_VERSION,
            profileNamespace: this.options.lease.paths.profileNamespace,
            dataRoot: this.options.lease.paths.dataRoot,
            ownerGeneration: this.generation,
            transport: { kind: "http-loopback", port: this.port },
            token: this.token,
            nonce: this.nonce,
            createdAt: new Date().toISOString(),
          };
          writeFileAtomic(offerPath(this.options.lease.paths), `${JSON.stringify(offer)}\n`, {
            encoding: "utf8",
            mode: 0o600,
          });
          barrier.resolve();
        } catch (error) {
          barrier.reject(error);
        }
      });
    } catch (error) {
      barrier.reject(error);
    }
    return this.starting;
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    void Promise.resolve(this.starting)
      .catch(() => undefined)
      .then(() => this.connections.close(250))
      .then(() => {
        removeOfferFile(this.options.lease.paths, this.generation);
      })
      .then(barrier.resolve, barrier.reject);
    return this.closing;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const authority = `127.0.0.1:${this.port}`;
    const peer = request.socket.remoteAddress;
    if (
      this.stopping ||
      this.served ||
      (peer !== "127.0.0.1" && peer !== "::ffff:127.0.0.1") ||
      request.method !== "POST" ||
      request.url !== "/adopt-native-key" ||
      request.headers.host !== authority ||
      request.headers.origin !== undefined ||
      request.headers["content-type"] !== "application/json" ||
      request.headers["content-encoding"] !== undefined
    ) {
      response.writeHead(403, { connection: "close" });
      response.end();
      return;
    }
    const timer = setTimeout(() => request.destroy(), INPUT_DEADLINE_MS);
    try {
      const body = await readBoundedNodeRequestBody(
        request,
        MAX_REQUEST_BYTES,
        () => new Error("Key adoption request too large."),
      );
      const proof = {
        authorization: request.headers.authorization,
        method: request.method,
        path: request.url!,
        authority,
        body,
      };
      if (!authenticateHostControlRequest(this.token, proof)) {
        response.writeHead(401, { connection: "close" });
        response.end();
        return;
      }
      const result = await this.admit(body);
      const reply = result.outcome.ok
        ? {
            version: HOST_KEY_ADOPTION_PROTOCOL_VERSION,
            requestId: result.requestId,
            ownerGeneration: this.generation,
            ok: true as const,
            key: result.outcome.key,
          }
        : {
            version: HOST_KEY_ADOPTION_PROTOCOL_VERSION,
            requestId: result.requestId,
            ownerGeneration: this.generation,
            ok: false as const,
            code: result.outcome.code,
          };
      const bytes = Buffer.from(JSON.stringify(reply));
      if (bytes.length > MAX_RESPONSE_BYTES) throw new Error("Key adoption response too large.");
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        connection: "close",
        "x-poracode-control-proof": createHostControlResponseProof(
          this.token,
          proof.authorization,
          200,
          bytes,
        ),
      });
      response.end(bytes);
    } finally {
      clearTimeout(timer);
    }
  }

  private async admit(body: Buffer): Promise<AdoptionResult> {
    const parsed = adoptionRequestSchema.safeParse(JSON.parse(body.toString("utf8")));
    if (!parsed.success)
      return { requestId: randomUUID(), outcome: { ok: false, code: "invalid-request" } };
    const input: AdoptionRequest = parsed.data;
    const refuse = (code: AdoptionErrorCode): AdoptionResult => ({
      requestId: input.requestId,
      outcome: { ok: false, code },
    });
    if (this.stopping) return refuse("unavailable");
    if (this.served) return refuse("already-served");
    if (input.nonce !== this.nonce) return refuse("invalid-request");
    if (
      input.profileNamespace !== this.options.lease.paths.profileNamespace ||
      input.dataRoot !== this.options.lease.paths.dataRoot
    )
      return refuse("profile-mismatch");
    this.options.lease.assertActive(this.generation);
    let key: string;
    try {
      key = await this.options.unseal(input.sealedKey, this.generation);
    } catch (error) {
      this.options.reportError?.(error);
      // A failed native unseal does not consume the one-shot offer.
      return refuse("unavailable");
    }
    this.options.lease.assertActive(this.generation);
    if (!isValidKeyMaterial(key)) return refuse("unavailable");
    this.served = true;
    // Retire the offer before the answer leaves: a crashed requester cannot
    // leave a live offer behind, and no second unseal can ever be minted.
    removeOfferFile(this.options.lease.paths, this.generation);
    return { requestId: input.requestId, outcome: { ok: true, key } };
  }
}

export class HostKeyAdoptionRefusedError extends Error {
  constructor(readonly code: AdoptionErrorCode) {
    super(`The desktop owner refused the key-adoption request: ${code}.`);
    this.name = "HostKeyAdoptionRefusedError";
  }
}

/** Client half used by the headless activation entry (see activationHostRoot.ts). */
export async function requestNativeKeyAdoption(
  paths: HostRootPaths,
  sealedKey: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  options.signal?.throwIfAborted();
  if (!isValidSealedKey(sealedKey)) throw new Error("Invalid sealed key bytes for adoption.");
  const offer = readHostKeyAdoptionOffer(paths);
  const timeoutMs = options.timeoutMs ?? DEFAULT_ADOPTION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5_000)
    throw new Error("Invalid key-adoption request deadline.");
  const input = {
    version: HOST_KEY_ADOPTION_PROTOCOL_VERSION,
    requestId: randomUUID(),
    nonce: offer.nonce,
    profileNamespace: paths.profileNamespace,
    dataRoot: paths.dataRoot,
    sealedKey,
  };
  const body = Buffer.from(JSON.stringify(input));
  const authority = `127.0.0.1:${offer.transport.port}`;
  const path = "/adopt-native-key";
  const authorization = createHostControlRequestProof(offer.token, {
    method: "POST",
    path,
    authority,
    body,
  });
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, key?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      outgoing.destroy();
      if (error) reject(error);
      else resolve(key!);
    };
    const abort = () => finish(new Error("Key-adoption request was cancelled."));
    const timer = setTimeout(
      () => finish(new Error("Timed out waiting for the key-adoption response.")),
      timeoutMs,
    );
    const outgoing = httpRequest(
      {
        hostname: "127.0.0.1",
        family: 4,
        port: offer.transport.port,
        method: "POST",
        path,
        agent: false,
        maxHeaderSize: 4_096,
        headers: {
          host: authority,
          authorization,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          connection: "close",
        },
      },
      (incoming) => {
        void readBoundedNodeRequestBody(
          incoming,
          MAX_RESPONSE_BYTES,
          () => new Error("Key-adoption response exceeded its size limit."),
        )
          .then((bytes) => {
            if (
              !verifyHostControlResponse(
                offer.token,
                authorization,
                incoming.statusCode ?? 0,
                bytes,
                incoming.headers["x-poracode-control-proof"],
              )
            )
              throw new Error("Invalid key-adoption peer proof.");
            const value: unknown = JSON.parse(bytes.toString("utf8"));
            const refused = adoptionRefusalSchema.safeParse(value);
            if (refused.success) throw new HostKeyAdoptionRefusedError(refused.data.code);
            const reply = adoptionSuccessSchema.safeParse(value);
            if (!reply.success) throw new HostKeyAdoptionRefusedError("unavailable");
            if (
              reply.data.requestId !== input.requestId ||
              reply.data.ownerGeneration !== offer.ownerGeneration
            )
              throw new Error("Key-adoption response did not match the requested owner.");
            if (incoming.statusCode !== 200) throw new Error("Invalid key-adoption status.");
            finish(undefined, reply.data.key);
          })
          .catch((error: unknown) =>
            finish(error instanceof Error ? error : new Error("Invalid key-adoption response.")),
          );
      },
    );
    outgoing.once("error", () =>
      finish(new Error("The key-adoption endpoint could not be reached.")),
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    else outgoing.end(body);
  });
}
