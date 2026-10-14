/**
 * Authenticated interactions with a running server install: the JSON HTTP
 * helper, pairing + token exchange, doctor gates, running-build status, and
 * tolerant list-route reads.
 */

import { jsonRequest, readQualificationProtocolVersion } from "../qualification-http.mjs";
export { jsonRequest } from "../qualification-http.mjs";
import { pairingCredentialFromCliOutput, parseLastJsonLine } from "./server-process.mjs";

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

/** Authenticated status of the running owner (build identity + roots). */
export function readRunningStatus(runCli, entry, env) {
  const reply = parseLastJsonLine(runCli(entry, ["status", "--json"], env).stdout);
  if (!reply?.result?.build?.version) {
    throw new Error(
      `status --json returned no build identity: ${JSON.stringify(reply).slice(0, 500)}`,
    );
  }
  return reply.result;
}

/** Tolerant read of a list route: modern bounded reads first, plain fallback. */
export async function listRoute(fetchImpl, url, token, modernQuery, fallbackQuery) {
  const modern = await jsonRequest(fetchImpl, `${url}${modernQuery}`, { token });
  if (modern.status === 200) return { status: 200, body: modern.body, via: modernQuery };
  const plain = await jsonRequest(fetchImpl, `${url}${fallbackQuery}`, { token });
  return { ...plain, via: fallbackQuery, modernStatus: modern.status };
}
