import { describe, expect, it, vi } from "vitest";
import { RemoteEnvironmentClient } from "./clientEnvironments";
import type { RemoteFetch } from "./clientTypes";
import type { EnvironmentMediaTicketResult } from "./media";

describe("environment media retirement", () => {
  it("retires child and parent grants when disposal overtakes the parent mint", async () => {
    const childTicket = `pc_media_${"c".repeat(43)}`;
    const parentTicket = `pc_media_${"p".repeat(43)}`;
    let complete!: (result: EnvironmentMediaTicketResult) => void;
    let started!: () => void;
    const mintStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const releaseMediaTicket = vi.fn<(ticket: string) => Promise<void>>(async () => {});
    const fetchImpl = vi.fn<RemoteFetch>(async (url) =>
      String(url).endsWith("/media-ticket")
        ? Response.json({
            ticket: childTicket,
            expiresAt: new Date(Date.now() + 120_000).toISOString(),
            sizeBytes: 10,
            modifiedAtMs: 1,
            contentType: "video/mp4",
          })
        : Response.json({ ok: true }),
    );
    const client = new RemoteEnvironmentClient(
      "http://parent.test/api/environments/env/proxy/",
      "child-bearer",
      fetchImpl,
      {
        environmentId: "env",
        parentAuthority: {
          accessToken: () => "parent-bearer",
          ensureLive: async () => {},
          mintWebSocketTicket: async () => ({
            ticket: "unused",
            expiresAt: new Date().toISOString(),
          }),
          mintMediaTicket: () =>
            new Promise((resolve) => {
              complete = resolve;
              started();
            }),
          releaseMediaTicket,
        },
      },
    );
    const pending = client.createMediaSource({
      access: "project",
      projectLocation: { kind: "posix", path: "/project" },
      path: "clip.mp4",
    });
    await mintStarted;
    client.dispose();
    complete({ ticket: parentTicket, expiresAt: new Date(Date.now() + 120_000).toISOString() });
    await expect(pending).rejects.toMatchObject({ status: 499, code: "cancelled" });
    expect(releaseMediaTicket).toHaveBeenCalledWith(parentTicket);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/media-release"))).toBe(true);
    await expect(
      client.createMediaSource({
        access: "project",
        projectLocation: { kind: "posix", path: "/project" },
        path: "clip.mp4",
      }),
    ).rejects.toMatchObject({ status: 499 });
  });
});
