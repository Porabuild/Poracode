/**
 * Authenticated interactions with a running server install: the JSON HTTP
 * helper, pairing + token exchange, doctor gates, running-build status, and
 * tolerant list-route reads.
 */

import { jsonRequest, readQualificationProtocolVersion } from "../qualification-http.mjs";
export { jsonRequest } from "../qualification-http.mjs";
import { pairingCredentialFromCliOutput, parseLastJsonLine } from "./server-process.mjs";
import { redactSecrets } from "./redaction.mjs";

/** Pair against the running daemon; the pairing URL never survives an error. */
export async function pairAndAuthenticate(runCli, entry, env, httpBase, fetchImpl, doctorReport) {
  const protocolVersion = await readQualificationProtocolVersion(fetchImpl, httpBase, doctorReport);
  // Parse the credential from the in-memory raw result. Redaction belongs at
  // log/evidence sinks; redacting before this point would destroy the URL the
  // gate itself must exchange.
  const credential = pairingCredentialFromCliOutput(runCli(entry, ["pair", "--json"], env).stdout);

  const token = await jsonRequest(fetchImpl, `${httpBase}/oauth/token`, {
    method: "POST",
    body: {
      grantType: "pairing-token",
      credential,
      scopes: [
        "session:read",
        "session:operate",
        "projects:manage",
        "terminal:operate",
        "terminal:read",
      ],
      client: { label: "n1-qualify", deviceType: "desktop" },
    },
  });
  if (token.status !== 200) throw new Error(`pairing token exchange failed: ${token.status}`);
  return { token: token.body.accessToken, protocolVersion };
}

export function assertDoctorOk(runCli, entry, env, label) {
  const report = parseLastJsonLine(runCli(entry, ["doctor", "--json"], env).stdout);
  if ((report.checks ?? []).some((check) => check.status === "error")) {
    throw new Error(`${label} doctor failed: ${JSON.stringify(report).slice(0, 2_000)}`);
  }
  return report;
}

/**
 * Authenticated running-owner build identity. Only `status --details --json`
 * carries it, as { formatVersion: 1, view: "running-owner", status: { build,
 * dataRoot } }. Plain `status --json` is the basic describe reply (no build),
 * and `reply.result.build` is the raw host-control shape the CLI never emits —
 * so no legacy CLI contract exists. Every mismatch fails closed, typed.
 */
export function readRunningStatus(runCli, entry, env) {
  let raw;
  try {
    raw = runCli(entry, ["status", "--details", "--json"], env).stdout;
  } catch (error) {
    const failure = new Error(
      `status --details --json unavailable (requires host-control status / control protocol v2): ` +
        redactSecrets(String(error?.message ?? error)),
    );
    failure.code = "STATUS_DETAILS_UNAVAILABLE";
    throw failure;
  }
  let reply;
  try {
    reply = parseLastJsonLine(raw);
  } catch (error) {
    const failure = new Error(
      `status --details --json returned invalid JSON: ${redactSecrets(String(error?.message ?? error))}`,
    );
    failure.code = "STATUS_CONTRACT_INVALID";
    throw failure;
  }
  const bad = (message) => {
    const failure = new Error(message);
    failure.code = "STATUS_CONTRACT_INVALID";
    throw failure;
  };
  if (reply?.formatVersion !== 1 || reply?.view !== "running-owner") {
    bad(
      `expected formatVersion 1 / running-owner status contract, got ` +
        `${String(reply?.formatVersion)} / ${String(reply?.view)}`,
    );
  }
  const status = reply.status;
  if (!status || typeof status.build?.version !== "string" || !status.build.version) {
    bad("detailed status has no build.version to prove the exact candidate build");
  }
  if (typeof status.dataRoot !== "string" || !status.dataRoot) {
    bad("detailed status has no dataRoot to locate the persisted payload database");
  }
  return status;
}

/** Tolerant read of a list route: modern bounded reads first, plain fallback. */
export async function listRoute(fetchImpl, url, token, modernQuery, fallbackQuery) {
  const modern = await jsonRequest(fetchImpl, `${url}${modernQuery}`, { token });
  if (modern.status === 200) return { status: 200, body: modern.body, via: modernQuery };
  const plain = await jsonRequest(fetchImpl, `${url}${fallbackQuery}`, { token });
  return { ...plain, via: fallbackQuery, modernStatus: modern.status };
}
