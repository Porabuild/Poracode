import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HOST_CONTROL_PROTOCOL_VERSION } from "@/shared/hostControlProtocol";

const ENCODED_32_BYTES = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const AUTHORIZATION =
  /^Poracode-Control ([1-9][0-9]{0,15})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/u;
const MAX_PROOF_AGE_MS = 5_000;
const MAX_FUTURE_SKEW_MS = 1_000;

interface RequestProofInput {
  readonly method: string;
  readonly path: string;
  readonly authority: string;
  readonly body: Uint8Array;
}

function mac(
  secret: string,
  direction: "request" | "response",
  fields: unknown[],
  body: Uint8Array,
): string {
  if (!ENCODED_32_BYTES.test(secret)) throw new Error("Invalid host control credential.");
  return createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(`poracode-control-${direction}:${HOST_CONTROL_PROTOCOL_VERSION}\0`)
    .update(JSON.stringify(fields))
    .update("\0")
    .update(body)
    .digest("base64url");
}

function equalProof(expected: string, received: unknown): boolean {
  return (
    typeof received === "string" &&
    ENCODED_32_BYTES.test(received) &&
    timingSafeEqual(Buffer.from(expected, "base64url"), Buffer.from(received, "base64url"))
  );
}

/** The secret never crosses the socket; a reused port cannot sign a fresh reply. */
export function createHostControlRequestProof(
  secret: string,
  input: RequestProofInput,
  issuedAt = Date.now(),
  nonce = randomBytes(32).toString("base64url"),
): string {
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0 || !ENCODED_32_BYTES.test(nonce))
    throw new Error("Invalid host control proof parameters.");
  const proof = mac(
    secret,
    "request",
    [input.method, input.path, input.authority, issuedAt, nonce],
    input.body,
  );
  return `Poracode-Control ${issuedAt}.${nonce}.${proof}`;
}

export function authenticateHostControlRequest(
  secret: string,
  input: RequestProofInput & { authorization: unknown },
  now = Date.now(),
): input is RequestProofInput & { authorization: string } {
  if (typeof input.authorization !== "string") return false;
  const parts = AUTHORIZATION.exec(input.authorization);
  if (!parts) return false;
  const issuedAt = Number(parts[1]);
  const nonce = parts[2]!;
  if (
    !Number.isSafeInteger(issuedAt) ||
    String(issuedAt) !== parts[1] ||
    !ENCODED_32_BYTES.test(nonce) ||
    issuedAt < now - MAX_PROOF_AGE_MS ||
    issuedAt > now + MAX_FUTURE_SKEW_MS
  )
    return false;
  const expected = mac(
    secret,
    "request",
    [input.method, input.path, input.authority, issuedAt, nonce],
    input.body,
  );
  return equalProof(expected, parts[3]);
}

/** Request/response domains prevent reflecting a valid request MAC as a reply. */
export function createHostControlResponseProof(
  secret: string,
  authorization: string,
  status: number,
  body: Uint8Array,
): string {
  return mac(secret, "response", [authorization, status], body);
}

export function verifyHostControlResponse(
  secret: string,
  authorization: string,
  status: number,
  body: Uint8Array,
  proof: unknown,
): boolean {
  return equalProof(createHostControlResponseProof(secret, authorization, status, body), proof);
}
