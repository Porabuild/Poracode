import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    set: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    eval: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    del: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    zadd: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    zrem: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    incr: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    zscore: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    zrange: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    expire: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
  remove: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  head: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getBlob: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  token: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => mocks.db } }));
vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  del: mocks.remove,
  get: mocks.getBlob,
  head: mocks.head,
}));
import { BlobNotFoundError } from "@vercel/blob";
vi.mock("@vercel/blob/client", () => ({ generateClientTokenFromReadWriteToken: mocks.token }));
import {
  completeFeedback,
  matchesFile,
  startFeedback,
  validateFeedback,
  resumeFeedback,
  limitFeedbackRequests,
  cleanupFeedback,
} from "./feedback";

const id = "12345678-1234-1234-1234-123456789012";
const form = {
  version: 1,
  kind: "bug",
  title: "Changes are stale",
  details: "The previous branch files remain after switching branches.",
  files: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "FEEDBACK_GITHUB_TOKEN",
    "CRON_SECRET",
  ])
    vi.stubEnv(key, "test-only");
  mocks.db.set.mockResolvedValue("OK");
  mocks.db.incr.mockResolvedValue(1);
  mocks.db.eval.mockResolvedValue(1);
  mocks.db.zscore.mockResolvedValue(0);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("feedback trust and delivery", () => {
  it("rejects older contracts, oversized files, and path filenames", () => {
    expect(() => validateFeedback({ ...form, version: 0 })).toThrow(/Check|Attachments|filename/);
    expect(() =>
      validateFeedback({ ...form, files: [{ name: "a.png", size: 10_000_001 }] }),
    ).toThrow(/Check|Attachments|filename/);
    expect(() => validateFeedback({ ...form, files: [{ name: "../a.png", size: 10 }] })).toThrow(
      /Check|Attachments|filename/,
    );
  });
  it.each(["constructor", "__proto__", "toString"])(
    "rejects inherited extension %s",
    (extension) => {
      expect(() =>
        validateFeedback({ ...form, files: [{ name: `report.${extension}`, size: 8 }] }),
      ).toThrow("Attachments must be supported files up to 10 MB each.");
    },
  );
  it("renews a missing upload after the real SDK not-found error", async () => {
    mocks.db.get.mockResolvedValue({
      ...form,
      created: Date.now(),
      files: [{ name: "a.png", size: 8, type: "image/png", path: "staged", attempts: 0 }],
    });
    mocks.head.mockRejectedValue(new BlobNotFoundError());
    mocks.token.mockResolvedValue("renewed");
    await expect(resumeFeedback(id)).resolves.toMatchObject({
      grants: [{ token: "renewed" }],
      uploaded: [],
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("removes a truncated upload before issuing a replacement grant", async () => {
    mocks.db.get.mockResolvedValue({
      ...form,
      created: Date.now(),
      files: [{ name: "a.png", size: 8, type: "image/png", path: "staged", attempts: 0 }],
    });
    mocks.head.mockResolvedValue({ size: 3 });
    mocks.token.mockResolvedValue("renewed");
    await expect(resumeFeedback(id)).resolves.toMatchObject({
      grants: [{ token: "renewed" }],
      uploaded: [],
    });
    expect(mocks.remove).toHaveBeenCalledWith("staged");
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.token.mock.invocationCallOrder[0]!,
    );
  });
  it("does not upload an attachment already delivered to GitHub again", async () => {
    mocks.db.get.mockResolvedValue({
      ...form,
      created: Date.now(),
      files: [
        {
          name: "a.png",
          size: 8,
          type: "image/png",
          path: "staged",
          attempts: 1,
          asset: "https://github.com/user-attachments/assets/example",
        },
      ],
    });
    await expect(resumeFeedback(id)).resolves.toMatchObject({
      grants: [{ token: "" }],
      uploaded: [0],
    });
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("removes objects recreated after delivery when their grants expire", async () => {
    mocks.db.zrange.mockResolvedValue([id]);
    await cleanupFeedback();
    expect(mocks.remove).toHaveBeenCalledWith(
      Array.from({ length: 5 }, (_, index) => `feedback:v1:${id}/${index}`),
    );
    expect(mocks.db.zrem).toHaveBeenCalledWith("feedback:v1:expiry", id);
  });
  it("does not clean an upload whose grant was renewed after the sweep started", async () => {
    mocks.db.zrange.mockResolvedValue([id]);
    mocks.db.zscore.mockResolvedValue(Date.now() + 660000);
    await cleanupFeedback();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.db.zrem).not.toHaveBeenCalled();
  });
  it("keeps expiry cleanup working when intake credentials are disabled", async () => {
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "");
    mocks.db.zrange.mockResolvedValue([id]);
    await cleanupFeedback();
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.db.zrem).toHaveBeenCalledWith("feedback:v1:expiry", id);
  });
  it("recovers the issue link after a successful delivery response was lost", async () => {
    const url = "https://github.com/Porabuild/Poracode/issues/42";
    mocks.db.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ url });
    await expect(resumeFeedback(id)).resolves.toEqual({ url });
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("limits incoming calls before granting uploads", async () => {
    mocks.db.incr.mockResolvedValue(121);
    await expect(limitFeedbackRequests("127.0.0.1")).rejects.toMatchObject({ status: 429 });
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("checks bytes rather than trusting a declared image type", () => {
    expect(matchesFile(Buffer.from("<html>hello</html>"), "image/png")).toBe(false);
    expect(matchesFile(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe(true);
    expect(matchesFile(Buffer.from([65, 0, 66]), "text/plain")).toBe(false);
  });
  it("issues no upload permissions if the shared budget refuses the reservation", async () => {
    mocks.db.eval.mockResolvedValue(0);
    await expect(
      startFeedback({ ...form, files: [{ name: "a.png", size: 8 }] }, "127.0.0.1"),
    ).rejects.toMatchObject({ status: 429 });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.db.zadd).not.toHaveBeenCalled();
  });
  it.each([{}, { token: "legacy-challenge" }])(
    "accepts v1 reports without a challenge service and keeps IP quotas private: %j",
    async (legacy) => {
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      mocks.token.mockResolvedValue("upload-grant");
      const ip = "192.0.2.1";
      await limitFeedbackRequests(ip);
      await expect(
        startFeedback({ ...form, ...legacy, files: [{ name: "a.png", size: 8 }] }, ip),
      ).resolves.toMatchObject({ grants: [{ token: "upload-grant" }] });
      expect(fetcher).not.toHaveBeenCalled();
      const requestKey = String(mocks.db.incr.mock.calls[0]![0]);
      const quotaKeys = mocks.db.eval.mock.calls[0]![1] as string[];
      const hash = requestKey.split(":")[3];
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(quotaKeys[0]).toContain(`:hour:${hash}:`);
      expect(requestKey).not.toContain(ip);
      expect(quotaKeys[0]).not.toContain(ip);
    },
  );
  it("reconciles an uncertain creation without posting a second issue", async () => {
    const marker = `<!-- poracode-feedback:${id} -->`;
    mocks.db.get.mockResolvedValue({ ...form, created: Date.now(), creating: true });
    const fetcher = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce(
        Response.json([
          { number: 42, html_url: "https://github.com/Porabuild/Poracode/issues/42", body: marker },
        ]),
      )
      .mockResolvedValueOnce(Response.json({ body: marker }));
    vi.stubGlobal("fetch", fetcher);
    await expect(completeFeedback(id)).resolves.toEqual({
      url: "https://github.com/Porabuild/Poracode/issues/42",
    });
    expect(
      fetcher.mock.calls.every(([, options]) => (options as RequestInit).method !== "POST"),
    ).toBe(true);
    expect(mocks.db.del).toHaveBeenCalledWith(`feedback:v1:submission:${id}`);
    expect(mocks.db.zrem).not.toHaveBeenCalled();
    expect(mocks.db.zadd).toHaveBeenCalledWith(
      "feedback:v1:expiry",
      expect.objectContaining({ member: id, score: expect.any(Number) }),
    );
  });
  it("finds a lost creation beyond the first GitHub issue page", async () => {
    const created = Date.now();
    const marker = `<!-- poracode-feedback:${id} -->`;
    mocks.db.get.mockResolvedValue({ ...form, created, creating: true });
    const newer = Array.from({ length: 100 }, (_, n) => ({
      number: n + 100,
      body: "unrelated",
      created_at: new Date(created + 1000).toISOString(),
    }));
    const fetcher = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce(Response.json(newer))
      .mockResolvedValueOnce(
        Response.json([
          { number: 42, html_url: "https://github.com/Porabuild/Poracode/issues/42", body: marker },
        ]),
      )
      .mockResolvedValueOnce(Response.json({ body: marker }));
    vi.stubGlobal("fetch", fetcher);
    await expect(completeFeedback(id)).resolves.toMatchObject({
      url: "https://github.com/Porabuild/Poracode/issues/42",
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("page=2");
  });
  it("retains temporary content when a GitHub attachment cannot be verified", async () => {
    const asset = "https://github.com/user-attachments/assets/example";
    mocks.db.get.mockResolvedValue({
      ...form,
      created: Date.now(),
      issue: 42,
      url: "https://github.com/Porabuild/Poracode/issues/42",
      files: [{ name: "a.png", size: 8, path: "staged", attempts: 1, asset }],
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValueOnce(
          Response.json({ body: `${asset}\n<!-- poracode-feedback:${id} -->` }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    await expect(completeFeedback(id)).rejects.toThrow("not available");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.db.del).not.toHaveBeenCalledWith(`feedback:v1:submission:${id}`);
  });
});
