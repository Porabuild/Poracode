import { afterEach, describe, expect, it, vi } from "vitest";
import { changelogDocumentSchema } from "../../src/shared/changelog.ts";
import { controlRequest, startLab } from "./helpers/testClient.ts";

describe("public Changelog fixture", () => {
  let harness: Awaited<ReturnType<typeof startLab>> | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
  });

  it("serves only the public GET without a capability and keeps fixture mutations gated", async () => {
    harness = await startLab();
    const feed = new URL("/v1/fixtures/changelog.json", harness.controlUrl);
    const response = await fetch(feed);
    expect(response.status).toBe(200);
    const initial = changelogDocumentSchema.parse(await response.json());
    expect(initial.releases).toHaveLength(3);
    for (const mode of ["good", "updated", "error", "invalid", "hold"]) {
      const denied = await fetch(new URL(`/v1/checkpoints/changelog-${mode}`, harness.controlUrl), {
        method: "POST",
      });
      expect(denied.status).toBe(401);
      await denied.arrayBuffer();
    }
    const deniedWrite = await fetch(feed, { method: "POST" });
    expect(deniedWrite.status).toBe(401);
    await deniedWrite.arrayBuffer();
    const deniedState = await fetch(new URL("/v1/fixtures/changelog/state", harness.controlUrl));
    expect(deniedState.status).toBe(401);
    await deniedState.arrayBuffer();
    await controlRequest(harness, "/v1/checkpoints/changelog-updated", { method: "POST" });
    expect(changelogDocumentSchema.parse(await (await fetch(feed)).json()).releases[0]?.title).toBe(
      "Updated release notes",
    );
    await controlRequest(harness, "/v1/checkpoints/changelog-error", { method: "POST" });
    const unavailable = await fetch(feed);
    expect(unavailable.status).toBe(503);
    await unavailable.arrayBuffer();
    await controlRequest(harness, "/v1/checkpoints/changelog-invalid", { method: "POST" });
    expect(changelogDocumentSchema.safeParse(await (await fetch(feed)).json()).success).toBe(false);
    await controlRequest(harness, "/v1/reset", { method: "POST" });
    expect(await (await fetch(feed)).json()).toEqual(initial);
  });

  it("releases held reads on a checkpoint and cancels them on shutdown", async () => {
    harness = await startLab();
    const feed = new URL("/v1/fixtures/changelog.json", harness.controlUrl);
    await controlRequest(harness, "/v1/checkpoints/changelog-hold", { method: "POST" });
    const held = fetch(feed).then((response) => response.json());
    await vi.waitFor(async () => {
      const state = await controlRequest(harness!, "/v1/fixtures/changelog/state");
      expect(await state.json()).toEqual({ heldReads: 1, streamingReads: 0 });
    });
    await controlRequest(harness, "/v1/checkpoints/changelog-updated", { method: "POST" });
    expect(changelogDocumentSchema.parse(await held).releases[0]?.title).toBe(
      "Updated release notes",
    );

    await controlRequest(harness, "/v1/checkpoints/changelog-hold", { method: "POST" });
    const pending = fetch(feed).then(
      () => "unexpected-response",
      () => "cancelled",
    );
    await vi.waitFor(async () => {
      const state = await controlRequest(harness!, "/v1/fixtures/changelog/state");
      expect(await state.json()).toEqual({ heldReads: 1, streamingReads: 0 });
    });
    await harness.stop();
    harness = undefined;
    expect(await pending).toBe("cancelled");
  });
});
