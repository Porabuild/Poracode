import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_API_BASE = "https://api.appstoreconnect.apple.com/v1";
const DEFAULT_BUNDLE_ID = "com.poracode.mobile";
const DEFAULT_LOCALE = "en-US";
const DEFAULT_POLL_INTERVAL_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1_000;
const JWT_LIFETIME_SECONDS = 10 * 60;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;
const TRANSIENT_POLL_STATUSES = new Set([429, 500, 502, 503, 504]);

function normalizePem(raw) {
  return raw
    .trim()
    .replace(/^["']|["']$/gu, "")
    .replace(/\\r/gu, "")
    .replace(/\r/gu, "")
    .replace(/\\n/gu, "\n")
    .trim();
}

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

export function createAppStoreConnectJwt({
  issuerId,
  keyId,
  privateKeyPem,
  nowSeconds = Math.floor(Date.now() / 1_000),
}) {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: nowSeconds,
      exp: nowSeconds + JWT_LIFETIME_SECONDS,
      aud: "appstoreconnect-v1",
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64Url(signature)}`;
}

export function parseGroupNames(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function summarizeApiErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  if (errors.length === 0) return "";
  return errors
    .map((err) => [err.status, err.code, err.title, err.detail].filter(Boolean).join(": "))
    .join("; ");
}

function createAscClient({ issuerId, keyId, privateKeyPem, apiBase, fetchImpl, now }) {
  return async function request(path, { method = "GET", body, allowedStatuses = [] } = {}) {
    const token = createAppStoreConnectJwt({
      issuerId,
      keyId,
      privateKeyPem,
      nowSeconds: Math.floor(now() / 1_000),
    });
    const url = path.startsWith("http") ? path : `${apiBase}${path}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let json = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const detail = summarizeApiErrors(json) || text.slice(0, 300) || response.statusText;
      const error = new Error(
        `App Store Connect ${method} ${path} failed (${response.status}): ${detail}`,
      );
      error.status = response.status;
      throw error;
    }
    return { status: response.status, json };
  };
}

export async function finalizeTestFlightBuild({
  issuerId,
  keyId,
  privateKeyPem,
  bundleId = DEFAULT_BUNDLE_ID,
  marketingVersion,
  buildNumber,
  whatsNew = "",
  locale = DEFAULT_LOCALE,
  groupNames = [],
  submitForBetaReview = true,
  apiBase = DEFAULT_API_BASE,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  log = (message) => console.log(message),
}) {
  if (!issuerId || !keyId || !privateKeyPem) {
    throw new Error("Missing App Store Connect API credentials (issuerId, keyId, privateKeyPem).");
  }
  if (!marketingVersion || !buildNumber) {
    throw new Error("Both marketingVersion and buildNumber are required.");
  }

  const request = createAscClient({ issuerId, keyId, privateKeyPem, apiBase, fetchImpl, now });

  const appsResponse = await request(`/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = (appsResponse.json?.data ?? []).find(
    (entry) => entry?.attributes?.bundleId === bundleId,
  );
  if (!app?.id) {
    throw new Error(
      `App Store Connect app not found for bundleId "${bundleId}". Create the app record in App Store Connect before uploading.`,
    );
  }
  log(`Resolved App Store Connect app ${bundleId} (${app.id}).`);

  const buildQuery =
    `/builds?filter[app]=${encodeURIComponent(app.id)}` +
    `&filter[preReleaseVersion.version]=${encodeURIComponent(marketingVersion)}` +
    `&filter[version]=${encodeURIComponent(String(buildNumber))}` +
    `&limit=5`;

  const deadline = now() + timeoutMs;
  let build = null;
  let lastState = "NOT_FOUND";
  let consecutivePollErrors = 0;
  while (true) {
    let buildsResponse;
    try {
      buildsResponse = await request(buildQuery);
      consecutivePollErrors = 0;
    } catch (error) {
      const transient =
        typeof error?.status === "number" ? TRANSIENT_POLL_STATUSES.has(error.status) : true;
      consecutivePollErrors += 1;
      if (!transient || consecutivePollErrors > MAX_CONSECUTIVE_POLL_ERRORS || now() >= deadline) {
        throw error;
      }
      log(
        `Transient App Store Connect poll error (${consecutivePollErrors}/${MAX_CONSECUTIVE_POLL_ERRORS}): ${error instanceof Error ? error.message : String(error)}`,
      );
      await sleep(pollIntervalMs);
      continue;
    }
    build = (buildsResponse.json?.data ?? []).find(
      (entry) => String(entry?.attributes?.version ?? "") === String(buildNumber),
    );
    const state = build?.attributes?.processingState ?? "NOT_FOUND";
    if (state !== lastState) {
      log(
        `TestFlight build ${marketingVersion} (${buildNumber}) state: ${state}${build?.id ? ` [${build.id}]` : ""}`,
      );
      lastState = state;
    }
    if (state === "VALID") break;
    if (state === "FAILED" || state === "INVALID") {
      throw new Error(
        `App Store Connect rejected build ${marketingVersion} (${buildNumber}) with processingState=${state}. Check App Store Connect for details.`,
      );
    }
    if (now() >= deadline) {
      throw new Error(
        `Timed out waiting for TestFlight build ${marketingVersion} (${buildNumber}) to finish processing (last state: ${state}).`,
      );
    }
    await sleep(pollIntervalMs);
  }

  const trimmedNotes = whatsNew.trim();
  let updatedLocalizationId = null;
  if (trimmedNotes.length > 0) {
    const locResponse = await request(
      `/builds/${encodeURIComponent(build.id)}/betaBuildLocalizations`,
    );
    const existing = (locResponse.json?.data ?? []).find(
      (entry) => entry?.attributes?.locale === locale,
    );
    if (existing?.id) {
      await request(`/betaBuildLocalizations/${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: {
          data: {
            id: existing.id,
            type: "betaBuildLocalizations",
            attributes: { whatsNew: trimmedNotes },
          },
        },
      });
      updatedLocalizationId = existing.id;
    } else {
      const created = await request("/betaBuildLocalizations", {
        method: "POST",
        body: {
          data: {
            type: "betaBuildLocalizations",
            attributes: { locale, whatsNew: trimmedNotes },
            relationships: {
              build: { data: { id: build.id, type: "builds" } },
            },
          },
        },
      });
      updatedLocalizationId = created.json?.data?.id ?? null;
    }
    log(`Updated TestFlight "What to Test" (${locale}) on build ${build.id}.`);
  }

  const assignedGroups = [];
  let submittedForReview = false;
  if (groupNames.length > 0) {
    const groupsResponse = await request(
      `/apps/${encodeURIComponent(app.id)}/betaGroups?limit=200`,
    );
    const availableGroups = groupsResponse.json?.data ?? [];
    const byName = new Map(
      availableGroups
        .filter((group) => typeof group?.attributes?.name === "string")
        .map((group) => [group.attributes.name.trim(), group]),
    );
    const missing = groupNames.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      throw new Error(
        `TestFlight beta group(s) not found in App Store Connect: ${missing.join(", ")}.`,
      );
    }

    let hasExternalGroup = false;
    for (const name of groupNames) {
      const group = byName.get(name);
      await request(`/betaGroups/${encodeURIComponent(group.id)}/relationships/builds`, {
        method: "POST",
        body: {
          data: [{ id: build.id, type: "builds" }],
        },
      });
      assignedGroups.push({
        id: group.id,
        name,
        internal: Boolean(group.attributes?.isInternalGroup),
      });
      if (!group.attributes?.isInternalGroup) hasExternalGroup = true;
      log(`Assigned build ${build.id} to TestFlight group "${name}" (${group.id}).`);
    }

    if (hasExternalGroup && submitForBetaReview) {
      const reviewResponse = await request("/betaAppReviewSubmissions", {
        method: "POST",
        allowedStatuses: [409],
        body: {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: {
              build: { data: { id: build.id, type: "builds" } },
            },
          },
        },
      });
      submittedForReview = reviewResponse.status >= 200 && reviewResponse.status < 300;
      log(
        submittedForReview
          ? `Submitted build ${build.id} for TestFlight Beta App Review.`
          : `Build ${build.id} is already submitted or approved for Beta App Review (HTTP ${reviewResponse.status}).`,
      );
    }
  }

  return {
    appId: app.id,
    buildId: build.id,
    processingState: build.attributes.processingState,
    updatedLocalizationId,
    assignedGroups,
    submittedForReview,
  };
}

async function runCli() {
  const keyPath = process.env.APP_STORE_CONNECT_KEY_PATH?.trim();
  const privateKeyPem = keyPath
    ? await readFile(keyPath, "utf8")
    : normalizePem(process.env.APP_STORE_CONNECT_PRIVATE_KEY ?? "");

  const pollIntervalMs = Number(
    process.env.TESTFLIGHT_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS,
  );
  const timeoutMs = Number(process.env.TESTFLIGHT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  await finalizeTestFlightBuild({
    issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID?.trim() ?? "",
    keyId: process.env.APP_STORE_CONNECT_KEY_ID?.trim() ?? "",
    privateKeyPem,
    bundleId: process.env.PORACODE_MOBILE_APP_ID?.trim() || DEFAULT_BUNDLE_ID,
    marketingVersion: process.env.PORACODE_MOBILE_VERSION_NAME?.trim() ?? "",
    buildNumber: process.env.PORACODE_MOBILE_BUILD_NUMBER?.trim() ?? "",
    whatsNew: process.env.TESTFLIGHT_WHAT_TO_TEST ?? "",
    locale: process.env.TESTFLIGHT_LOCALE?.trim() || DEFAULT_LOCALE,
    groupNames: parseGroupNames(process.env.TESTFLIGHT_GROUPS ?? ""),
    submitForBetaReview: process.env.TESTFLIGHT_SUBMIT_BETA_REVIEW !== "false",
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
