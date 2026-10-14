import { describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "./client";
import type { RemoteFetch } from "./clientTypes";

describe("media source compatibility", () => {
  it("keeps image-action reads bound to the issuing origin/path and TLS pin", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(async () => new Response(new Uint8Array([1, 2])));
    const pin = "a".repeat(64);
    const client = new RemoteDesktopClient("https://host.test/", "private-bearer", fetchImpl, {
      certFingerprint: pin,
    });
    const source = {
      url: "https://host.test/api/files/media?ticket=temporary",
      ticket: `pc_media_${"a".repeat(43)}`,
      expiresAt: new Date().toISOString(),
      sizeBytes: 2,
      modifiedAtMs: 1,
      contentType: "image/png",
    };
    expect(await client.fetchMediaImageBytes(source)).toEqual(new Uint8Array([1, 2]));
    expect(fetchImpl.mock.calls[0]?.[1]?.certFingerprint).toBe(pin);
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false);
    await expect(
      client.fetchMediaImageBytes({
        ...source,
        url: "https://other.test/api/files/media?ticket=temporary",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      client.fetchMediaImageBytes({
        ...source,
        url: "https://host.test/api/files/image?ticket=temporary",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("keeps the bearer in the mint header and only puts the temporary grant in the media URL", async () => {
    const ticket = `pc_media_${"a".repeat(43)}`;
    const fetchImpl = vi.fn<RemoteFetch>(async () =>
      Response.json({
        ticket,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        sizeBytes: 4,
        modifiedAtMs: 1,
        contentType: "audio/wav",
      }),
    );
    const client = new RemoteDesktopClient("https://host.test/", "private-bearer", fetchImpl);
    const source = await client.createMediaSource({
      access: "project",
      projectLocation: { kind: "posix", path: "/project" },
      path: "audio.wav",
    });
    expect(source.url).toBe(`https://host.test/api/files/media?ticket=${ticket}`);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).not.toContain("private-bearer");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-bearer");
    await client.releaseMediaSource(ticket);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe("https://host.test/api/files/media-release");
  });

  it("fails once on an old host, preserving the original scoped request without retrying absolute access", async () => {
    const fetchImpl = vi.fn<RemoteFetch>(async () =>
      Response.json({ error: { code: "not_found", message: "Missing route." } }, { status: 404 }),
    );
    const client = new RemoteDesktopClient("https://old.test/", "private-bearer", fetchImpl);
    await expect(
      client.createMediaSource({
        access: "project",
        projectLocation: { kind: "posix", path: "/project" },
        path: "clip.mp4",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toContain('"access":"project"');
  });
});
