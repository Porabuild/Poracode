import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_PROJECT_ID } from "./harness/labFixtures.ts";
import { applyLabCheckpoint } from "./harness/wireLabCheckpoints.ts";
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

it.each([
  { disposition: undefined, contentType: "video/mp4", attachment: null },
  {
    disposition: "attachment",
    contentType: "application/octet-stream",
    attachment: 'attachment; filename="transcript-video.mp4"',
  },
])(
  "serves the exact transcript video with $contentType",
  async ({ disposition, contentType, attachment }) => {
    const harness = await startLab();
    try {
      applyLabCheckpoint(harness.lab, "transcript-video-ready");
      const { accessToken } = await pairAndAuth(harness, ["session:read"]);
      const headers = {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      };
      const response = await fetch(new URL("/api/files/media-ticket", harness.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          access: "project",
          projectLocation: { kind: "posix", path: "/Users/fixture/project" },
          path: "reports/transcript-video.mp4",
          disposition,
        }),
      });
      expect(response.status).toBe(200);
      const { ticket, expiresAt } = (await response.json()) as {
        ticket: string;
        expiresAt: string;
      };
      const remaining = Date.parse(expiresAt) - Date.now();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThan(180_000);
      const mediaUrl = new URL("/api/files/media", harness.httpBaseUrl);
      mediaUrl.searchParams.set("ticket", ticket);
      const media = await fetch(mediaUrl);
      expect(media.status).toBe(200);
      expect(media.headers.get("content-type")).toBe(contentType);
      expect(media.headers.get("content-disposition")).toBe(attachment);
      expect(Buffer.from(await media.arrayBuffer())).toEqual(
        await readFile(new URL("./fixtures/transcript-video.mp4", import.meta.url)),
      );
      const release = await fetch(new URL("/api/files/media-release", harness.httpBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ ticket }),
      });
      expect(release.status).toBe(200);
      expect((await fetch(mediaUrl)).status).toBe(401);
    } finally {
      await harness.stop();
    }
  },
);
