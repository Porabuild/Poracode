import { afterEach, describe, expect, it } from "vitest";
import { pairingTokenFromUrl } from "./harness/wireLab.ts";
import { exchangeToken, startLab } from "./helpers/testClient.ts";

type Harness = Awaited<ReturnType<typeof startLab>>;

describe("pairing single-use", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("exchanges a pairing credential once and rejects replay", async () => {
    harness = await startLab();
    const pairing = harness.lab.issuePairingUrl();
    const credential = pairingTokenFromUrl(pairing.pairingUrl);
    const first = await exchangeToken(harness.httpBaseUrl, credential, ["session:read"]);
    expect(first.status).toBe(200);
    expect(first.accessToken.startsWith("lc_access_")).toBe(true);
    expect(first.scopes).toEqual(["session:read"]);

    const replay = await exchangeToken(harness.httpBaseUrl, credential, ["session:read"]);
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ error: { code: "invalid_pairing_token" } });
  });

  it("rejects an expired pairing credential", async () => {
    harness = await startLab();
    const issued = harness.lab.auth.issuePairingCredential({ ttlMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await exchangeToken(harness.httpBaseUrl, issued.credential, ["session:read"]);
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ error: { code: "invalid_pairing_token" } });
  });

  it("rejects unknown requested scopes without granting a session", async () => {
    harness = await startLab();
    const credential = pairingTokenFromUrl(harness.lab.issuePairingUrl().pairingUrl);
    const result = await exchangeToken(harness.httpBaseUrl, credential, [
      "session:read",
      "not-a-scope",
    ]);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: { code: "unknown_scope" } });
  });
});
