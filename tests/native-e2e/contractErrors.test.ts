import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_THREAD_ID } from "./harness/labFixtures.ts";
import { openReadySocket, pairAndAuth, startLab } from "./helpers/testClient.ts";

describe("strict lifecycle contract errors", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("rejects wrong paths, malformed bodies, non-empty empty bodies, and invalid queries", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    const auth = { authorization: `Bearer ${accessToken}` };
    const jsonHeaders = { ...auth, "content-type": "application/json" };

    expect(
      (
        await fetch(
          new URL(`/api/threads/${FIXTURE_THREAD_ID}/history/extra`, harness.httpBaseUrl),
          {
            headers: auth,
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(new URL("/api/threads/not-the-fixture/history", harness.httpBaseUrl), {
          headers: auth,
        })
      ).status,
    ).toBe(404);

    const invalidBody = await fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/send`, harness.httpBaseUrl),
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ prompt: "missing config" }),
      },
    );
    expect(invalidBody.status).toBe(400);
    expect(await invalidBody.json()).toMatchObject({ error: { code: "invalid_request" } });

    const nonEmpty = await fetch(new URL("/api/auth/websocket-ticket", harness.httpBaseUrl), {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ unexpected: true }),
    });
    expect(nonEmpty.status).toBe(400);

    for (const suffix of ["", "?limit=1e2", "?limit=100&unknown=true"]) {
      const query = await fetch(
        new URL(`/api/threads/${FIXTURE_THREAD_ID}/history/items${suffix}`, harness.httpBaseUrl),
        { headers: auth },
      );
      expect(query.status).toBe(400);
      expect(await query.json()).toMatchObject({ error: { code: "invalid_request" } });
    }

    const missingUploadMetadata = await fetch(
      new URL(`/api/files/attachment?threadId=${FIXTURE_THREAD_ID}`, harness.httpBaseUrl),
      { method: "POST", headers: auth, body: "data" },
    );
    expect(missingUploadMetadata.status).toBe(400);

    const emptyUpload = await fetch(
      new URL(
        `/api/files/attachment?threadId=${FIXTURE_THREAD_ID}&name=empty.txt`,
        harness.httpBaseUrl,
      ),
      { method: "POST", headers: auth },
    );
    expect(emptyUpload.status).toBe(400);
  });

  it("checks auth and scope before accepting a valid lifecycle body", async () => {
    harness = await startLab();
    const missing = await fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/send`, harness.httpBaseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "fixture", config: { model: "gpt-5" } }),
      },
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: { code: "missing_access_token" } });

    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const forbidden = await fetch(
      new URL(`/api/threads/${FIXTURE_THREAD_ID}/send`, harness.httpBaseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt: "fixture", config: { model: "gpt-5" } }),
      },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "missing_scope" } });
  });

  it("enforces the same strict query/body rules under a prefixed base path", async () => {
    harness = await startLab({ basePath: "/tunnels/native-fixture" });
    const { accessToken } = await pairAndAuth(harness, ["session:read"]);
    const valid = await fetch(
      new URL(
        `/tunnels/native-fixture/api/threads/${FIXTURE_THREAD_ID}/history/items?limit=25`,
        `http://127.0.0.1:${harness.hostPort}`,
      ),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(valid.status).toBe(200);
    const invalid = await fetch(
      new URL(
        `/tunnels/native-fixture/api/threads/${FIXTURE_THREAD_ID}/history/items?limit=-1`,
        `http://127.0.0.1:${harness.hostPort}`,
      ),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    expect(invalid.status).toBe(400);
    const socket = await openReadySocket(harness, accessToken);
    expect(socket.ready).toMatchObject({ type: "ready" });
    socket.ws.close();
  });
});
