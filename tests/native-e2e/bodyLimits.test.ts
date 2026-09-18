import { afterEach, describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES } from "./harness/constants.ts";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import { postChunked, startLab } from "./helpers/testClient.ts";

describe("oversized and chunked body rejection", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("rejects an oversized JSON body with 413", async () => {
    harness = await startLab();
    const credential = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    const oversized = JSON.stringify({
      grantType: "pairing-token",
      credential,
      padding: "x".repeat(MAX_JSON_BODY_BYTES),
    });
    const response = await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(oversized)),
      },
      body: oversized,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "body_too_large" } });
  });

  it("rejects chunked token-exchange bodies", async () => {
    harness = await startLab();
    const credential = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    const result = await postChunked(
      "127.0.0.1",
      harness.hostPort,
      "/oauth/token",
      JSON.stringify({ grantType: "pairing-token", credential }),
    );
    expect(result.status).toBe(400);
    expect(result.raw).toContain("chunked_body_not_allowed");
  });

  it("injects an HTML body when the html-body-token fixture is selected", async () => {
    harness = await startLab();
    harness.lab.activateFaultFixture("html-body-token");
    const response = await fetch(new URL("/oauth/token", harness.httpBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "pairing-token", credential: "x" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toContain("<html>");
  });
});
