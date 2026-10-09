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
  it("keeps both ticket URLs stable on renewal and ignores a parent renewal completed after disposal", async () => {
    const childTicket = `pc_media_${"c".repeat(43)}`;
    const parentTicket = `pc_media_${"p".repeat(43)}`;
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const releaseMediaTicket = vi.fn<(ticket: string) => Promise<void>>(async () => {});
    const renewMediaTicket = vi.fn<
      (ticket: string, signal?: AbortSignal) => Promise<EnvironmentMediaTicketResult>
    >(async () => ({ ticket: parentTicket, expiresAt }));
    const fetchImpl = vi.fn<RemoteFetch>(async (url) => {
      if (String(url).endsWith("/media-ticket"))
        return Response.json({
          ticket: childTicket,
          expiresAt,
          sizeBytes: 10,
          modifiedAtMs: 1,
          contentType: "video/mp4",
        });
      if (String(url).endsWith("/media-renew"))
        return Response.json({ ticket: childTicket, expiresAt });
      return Response.json({ ok: true });
    });
    const client = new RemoteEnvironmentClient(
      "http://parent.test/api/environments/env/proxy/",
      "child-bearer",
      fetchImpl,
      {
        environmentId: "env",
        parentAuthority: {
          accessToken: () => "parent-bearer",
          ensureLive: async () => {},
          mintWebSocketTicket: async () => ({ ticket: "unused", expiresAt }),
          mintMediaTicket: async () => ({ ticket: parentTicket, expiresAt }),
          releaseMediaTicket,
          renewMediaTicket,
        },
      },
    );
    const source = await client.createMediaSource({
      access: "project",
      projectLocation: { kind: "posix", path: "/project" },
      path: "clip.mp4",
    });
    const url = source.url;
    expect(await client.renewMediaSource(source.ticket)).toEqual({
      ticket: childTicket,
      expiresAt,
    });
    expect(source.url).toBe(url);
    expect(renewMediaTicket).toHaveBeenCalledWith(parentTicket, undefined);
    const dispatch = fetchImpl.mock.calls.find(([requestUrl]) =>
      String(requestUrl).endsWith("/media-renew"),
    )!;
    expect(String(dispatch[0])).not.toContain("bearer");
    expect(new Headers(dispatch[1]?.headers).get("authorization")).toBe("Bearer child-bearer");
    expect(new Headers(dispatch[1]?.headers).get("x-poracode-environment-authorization")).toBe(
      "Bearer parent-bearer",
    );
    let complete!: (result: EnvironmentMediaTicketResult) => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    renewMediaTicket.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
          started();
        }),
    );
    const pending = client.renewMediaSource(source.ticket);
    const refused = pending.catch((error: unknown) => error);
    await waiting;
    client.dispose();
    complete({ ticket: parentTicket, expiresAt });
    expect(await refused).toMatchObject({ status: 499, code: "cancelled" });
    expect(releaseMediaTicket).toHaveBeenCalledOnce();
    await expect(client.renewMediaSource(source.ticket)).rejects.toMatchObject({ status: 499 });
  });
});
