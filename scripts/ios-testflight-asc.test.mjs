import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  createAppStoreConnectJwt,
  finalizeTestFlightBuild,
  parseGroupNames,
} from "./ios-testflight-asc.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERROR",
    async text() {
      return payload === undefined ? "" : JSON.stringify(payload);
    },
  };
}

void test("createAppStoreConnectJwt emits a valid ES256 RFC 7515 token", () => {
  const jwt = createAppStoreConnectJwt({
    issuerId: "issuer-123",
    keyId: "KEY1234567",
    privateKeyPem: privateKey,
    nowSeconds: 1_700_000_000,
  });
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.deepEqual(header, { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.deepEqual(payload, {
    iss: "issuer-123",
    iat: 1_700_000_000,
    exp: 1_700_000_600,
    aud: "appstoreconnect-v1",
  });

  const verifier = createVerify("SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const signature = Buffer.from(parts[2], "base64url");
  assert.equal(signature.length, 64);
  assert.equal(verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature), true);
});

void test("parseGroupNames trims whitespace and skips empties", () => {
  assert.deepEqual(parseGroupNames(" Core Team , External Beta ,, "), [
    "Core Team",
    "External Beta",
  ]);
  assert.deepEqual(parseGroupNames(""), []);
});

void test("finalizeTestFlightBuild polls until VALID, updates whatsNew, assigns groups, and submits external builds", async () => {
  const requests = [];
  let buildPolls = 0;

  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method, path: parsed.pathname + parsed.search, body });
    assert.match(init.headers.Authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/u);

    if (parsed.pathname === "/v1/apps") {
      return jsonResponse(200, {
        data: [{ id: "app-1", attributes: { bundleId: "com.poracode.mobile" } }],
      });
    }
    if (parsed.pathname === "/v1/builds") {
      buildPolls += 1;
      if (buildPolls === 1) return jsonResponse(200, { data: [] });
      if (buildPolls === 2) {
        return jsonResponse(200, {
          data: [
            { id: "build-42", attributes: { version: "4201", processingState: "PROCESSING" } },
          ],
        });
      }
      return jsonResponse(200, {
        data: [{ id: "build-42", attributes: { version: "4201", processingState: "VALID" } }],
      });
    }
    if (parsed.pathname === "/v1/builds/build-42/betaBuildLocalizations") {
      return jsonResponse(200, {
        data: [{ id: "loc-en", attributes: { locale: "en-US" } }],
      });
    }
    if (parsed.pathname === "/v1/betaBuildLocalizations/loc-en" && init.method === "PATCH") {
      return jsonResponse(200, { data: { id: "loc-en" } });
    }
    if (parsed.pathname === "/v1/apps/app-1/betaGroups") {
      return jsonResponse(200, {
        data: [
          { id: "grp-int", attributes: { name: "Core Team", isInternalGroup: true } },
          { id: "grp-ext", attributes: { name: "External Beta", isInternalGroup: false } },
        ],
      });
    }
    if (parsed.pathname.endsWith("/relationships/builds") && init.method === "POST") {
      return jsonResponse(204);
    }
    if (parsed.pathname === "/v1/betaAppReviewSubmissions" && init.method === "POST") {
      return jsonResponse(201, { data: { id: "sub-1" } });
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`);
  };

  let clock = 1_700_000_000_000;
  const result = await finalizeTestFlightBuild({
    issuerId: "issuer-123",
    keyId: "KEY1234567",
    privateKeyPem: privateKey,
    marketingVersion: "2.0.0",
    buildNumber: "4201",
    whatsNew: "Adaptive iPad workspace and voice input.",
    groupNames: ["Core Team", "External Beta"],
    fetchImpl,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: () => {},
  });

  assert.equal(buildPolls, 3);
  assert.equal(result.appId, "app-1");
  assert.equal(result.buildId, "build-42");
  assert.equal(result.processingState, "VALID");
  assert.equal(result.updatedLocalizationId, "loc-en");
  assert.equal(result.submittedForReview, true);
  assert.deepEqual(result.assignedGroups, [
    { id: "grp-int", name: "Core Team", internal: true },
    { id: "grp-ext", name: "External Beta", internal: false },
  ]);

  const patchCall = requests.find((req) => req.method === "PATCH");
  assert.equal(patchCall.body.data.attributes.whatsNew, "Adaptive iPad workspace and voice input.");
});

void test("finalizeTestFlightBuild creates a new localization and treats already-submitted 409 as idempotent", async () => {
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/apps") {
      return jsonResponse(200, {
        data: [{ id: "app-1", attributes: { bundleId: "com.poracode.mobile" } }],
      });
    }
    if (parsed.pathname === "/v1/builds") {
      return jsonResponse(200, {
        data: [{ id: "build-9", attributes: { version: "900", processingState: "VALID" } }],
      });
    }
    if (parsed.pathname === "/v1/builds/build-9/betaBuildLocalizations") {
      return jsonResponse(200, { data: [] });
    }
    if (parsed.pathname === "/v1/betaBuildLocalizations" && init.method === "POST") {
      return jsonResponse(201, { data: { id: "loc-new" } });
    }
    if (parsed.pathname === "/v1/apps/app-1/betaGroups") {
      return jsonResponse(200, {
        data: [{ id: "grp-ext", attributes: { name: "Public", isInternalGroup: false } }],
      });
    }
    if (parsed.pathname.endsWith("/relationships/builds")) {
      return jsonResponse(204);
    }
    if (parsed.pathname === "/v1/betaAppReviewSubmissions") {
      return jsonResponse(409, { errors: [{ code: "ENTITY_ERROR.RELATIONSHIP.INVALID" }] });
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`);
  };

  const result = await finalizeTestFlightBuild({
    issuerId: "issuer-123",
    keyId: "KEY1234567",
    privateKeyPem: privateKey,
    marketingVersion: "2.0.0",
    buildNumber: "900",
    whatsNew: "First beta notes",
    groupNames: ["Public"],
    fetchImpl,
    sleep: async () => {},
    now: () => 1_700_000_000_000,
    log: () => {},
  });

  assert.equal(result.updatedLocalizationId, "loc-new");
  assert.equal(result.submittedForReview, false);
});

void test("finalizeTestFlightBuild fails loudly when Apple marks a build INVALID", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/apps") {
      return jsonResponse(200, {
        data: [{ id: "app-1", attributes: { bundleId: "com.poracode.mobile" } }],
      });
    }
    if (parsed.pathname === "/v1/builds") {
      return jsonResponse(200, {
        data: [{ id: "build-bad", attributes: { version: "101", processingState: "INVALID" } }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    finalizeTestFlightBuild({
      issuerId: "issuer-123",
      keyId: "KEY1234567",
      privateKeyPem: privateKey,
      marketingVersion: "2.0.0",
      buildNumber: "101",
      fetchImpl,
      sleep: async () => {},
      now: () => 1_700_000_000_000,
      log: () => {},
    }),
    /processingState=INVALID/u,
  );
});

void test("finalizeTestFlightBuild fails clearly when a configured beta group does not exist", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/apps") {
      return jsonResponse(200, {
        data: [{ id: "app-1", attributes: { bundleId: "com.poracode.mobile" } }],
      });
    }
    if (parsed.pathname === "/v1/builds") {
      return jsonResponse(200, {
        data: [{ id: "build-7", attributes: { version: "701", processingState: "VALID" } }],
      });
    }
    if (parsed.pathname === "/v1/apps/app-1/betaGroups") {
      return jsonResponse(200, {
        data: [{ id: "grp-1", attributes: { name: "Core Team", isInternalGroup: true } }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    finalizeTestFlightBuild({
      issuerId: "issuer-123",
      keyId: "KEY1234567",
      privateKeyPem: privateKey,
      marketingVersion: "2.0.0",
      buildNumber: "701",
      groupNames: ["Missing Group"],
      fetchImpl,
      sleep: async () => {},
      now: () => 1_700_000_000_000,
      log: () => {},
    }),
    /beta group\(s\) not found.*Missing Group/u,
  );
});

void test("finalizeTestFlightBuild retries transient 503 poll errors before succeeding", async () => {
  let polls = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/apps") {
      return jsonResponse(200, {
        data: [{ id: "app-1", attributes: { bundleId: "com.poracode.mobile" } }],
      });
    }
    if (parsed.pathname === "/v1/builds") {
      polls += 1;
      if (polls <= 2)
        return jsonResponse(503, { errors: [{ status: "503", title: "Service Unavailable" }] });
      return jsonResponse(200, {
        data: [{ id: "build-503", attributes: { version: "503", processingState: "VALID" } }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  let clock = 1_700_000_000_000;
  const result = await finalizeTestFlightBuild({
    issuerId: "issuer-123",
    keyId: "KEY1234567",
    privateKeyPem: privateKey,
    marketingVersion: "2.0.0",
    buildNumber: "503",
    fetchImpl,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: () => {},
  });

  assert.equal(polls, 3);
  assert.equal(result.buildId, "build-503");
});
