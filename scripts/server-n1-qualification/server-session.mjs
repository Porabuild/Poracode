/**
 * Authenticated interactions with a running server install: the JSON HTTP
 * helper, pairing + token exchange, doctor gates, running-build status, and
 * tolerant list-route reads.
 */

import { redactSecrets } from "./redaction.mjs";
import { pairingCredentialFromCliOutput, parseLastJsonLine } from "./server-process.mjs";

export async function jsonRequest(fetchImpl, url, { method = "GET", token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = redactSecrets(await response.text());
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

/** Pair against the running daemon; the pairing URL never survives an error. */
export async function pairAndAuthenticate(runCli, entry, env, httpBase, fetchImpl) {
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
  return token.body.accessToken;
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
