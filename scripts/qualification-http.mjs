/** Minimal HTTP client for installed-server qualification, including N-1 hosts. */
export const PROTOCOL_VERSION_HEADER = "x-poracode-protocol-version";

function assertVersion(version, label) {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error(`${label} must declare a positive safe integer protocol version`);
  }
}

/** Discover afresh for each running install, even when upgrade reuses its URL.
 * The host declaration, rather than this checkout's current protocol number,
 * lets the same minimal client qualify both published N-1 and candidate hosts.
 */
export async function readQualificationProtocolVersion(fetchImpl, httpBase, doctorReport) {
  const response = await jsonRequest(fetchImpl, `${httpBase}/.well-known/poracode/environment`);
  if (response.status !== 200) throw new Error(`environment ${response.status}`);
  const version = response.body?.protocolVersion;
  assertVersion(version, "environment");
  const doctorVersion = doctorReport?.versions?.remoteProtocolVersion;
  assertVersion(doctorVersion, "doctor");
  if (doctorVersion !== version) {
    throw new Error(`environment protocol ${version} disagrees with doctor ${doctorVersion}`);
  }
  return version;
}

export async function jsonRequest(
  fetchImpl,
  url,
  { method = "GET", token, body, protocolVersion } = {},
) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (
    token &&
    !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) &&
    new URL(url).pathname.startsWith("/api/")
  ) {
    assertVersion(protocolVersion, "authenticated API mutation");
    headers[PROTOCOL_VERSION_HEADER] = String(protocolVersion);
  }
  const response = await fetchImpl(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  // Authentication and websocket tickets must stay intact in memory. Redact
  // only at error/log/evidence sinks, never before parsing an auth response.
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}
