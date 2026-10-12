import { afterEach, describe, expect, it } from "vitest";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("auth and scope errors", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("returns 401 without a bearer token", async () => {
    harness = await startLab();
    const response = await fetch(new URL("/api/snapshot", harness.httpBaseUrl));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "missing_access_token" } });
  });

  it("returns 401 for an invalid bearer token", async () => {
    harness = await startLab();
    const response = await fetch(new URL("/api/snapshot", harness.httpBaseUrl), {
      headers: { authorization: "Bearer lc_access_not-real" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_access_token" } });
  });

  it("returns 403 when the session lacks the route scope", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const response = await fetch(new URL("/api/projects/command", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "add-existing", path: "/tmp/x" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "missing_scope" } });
  });

  it("rejects a control request that presents the wrong capability", async () => {
    harness = await startLab();
    const response = await fetch(new URL("/v1/state", harness.controlUrl), {
      headers: { authorization: "Harness totally-not-the-capability" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_capability" } });
  });
});
