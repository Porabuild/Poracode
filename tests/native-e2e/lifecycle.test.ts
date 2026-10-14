import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_PROJECT_ID } from "./harness/labFixtures.ts";
import { pairAndAuth, startLab } from "./helpers/testClient.ts";

const MCP_SERVER = {
  id: "fixture-memory",
  name: "fixture-memory",
  transport: { type: "stdio", command: "node" },
} as const;

describe("project configuration and lifecycle tri-state fixtures", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("preserves absent config and distinguishes null from a concrete value", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "projects:manage"]);
    const call = (body: unknown) =>
      fetch(new URL("/api/projects/command", harness!.httpBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const settings = async () => {
      const response = await fetch(
        new URL(`/api/projects/${FIXTURE_PROJECT_ID}/settings`, harness!.httpBaseUrl),
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      expect(response.status).toBe(200);
      return response.json();
    };

    expect(
      (
        await call({
          kind: "update",
          projectId: FIXTURE_PROJECT_ID,
          patch: { mcpServers: [MCP_SERVER] },
        })
      ).status,
    ).toBe(200);
    expect(await settings()).toMatchObject({ mcpServers: [MCP_SERVER] });

    expect(
      (
        await call({
          kind: "update",
          projectId: FIXTURE_PROJECT_ID,
          patch: { name: "Absent preserves config" },
        })
      ).status,
    ).toBe(200);
    expect(await settings()).toMatchObject({ mcpServers: [MCP_SERVER] });

    expect(
      (
        await call({
          kind: "update",
          projectId: FIXTURE_PROJECT_ID,
          patch: { mcpServers: null },
        })
      ).status,
    ).toBe(200);
    expect(await settings()).toEqual({ mcpServers: [] });
  });

  it("round-trips null and value project notes without fabricating omitted data", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["session:read", "session:operate"]);
    for (const doc of [null, { type: "doc", content: [] }]) {
      const write = await fetch(
        new URL(`/api/projects/${FIXTURE_PROJECT_ID}/notes`, harness.httpBaseUrl),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ doc, todos: [], updatedAt: "2026-08-12T10:03:00.000Z" }),
        },
      );
      expect(write.status).toBe(200);
      const read = await fetch(
        new URL(`/api/projects/${FIXTURE_PROJECT_ID}/notes`, harness.httpBaseUrl),
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      expect(await read.json()).toMatchObject({ notes: { doc } });
    }
  });

  it("keeps provider/external project creation variants explicitly unsupported", async () => {
    harness = await startLab();
    const { accessToken } = await pairAndAuth(harness, ["projects:manage"]);
    const response = await fetch(new URL("/api/projects/command", harness.httpBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "create", parentPath: "/tmp", name: "external-fixture" }),
    });
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ error: { code: "unconfigured_contract_case" } });
    expect(harness.lab.ledger.snapshot().operations["route:project-command"]?.status).toBe(
      "negative-passed",
    );
  });
});
