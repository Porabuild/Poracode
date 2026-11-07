import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { closeImageLightbox, imageLightboxRevision, openAttachmentLightbox } from "./ImageLightbox";
import type { ClientDraftAsset } from "@/renderer/state/composerDrafts/clientDraftDatabase";
const reads = vi.hoisted(() => vi.fn<() => Promise<ClientDraftAsset>>());
vi.mock("@/renderer/state/composerDrafts/readDraftAsset", () => ({ readDraftAsset: reads }));
const images = ["one", "two"].map((id) => ({
  id,
  path: `poracode-draft-asset:${id}/image.png`,
  name: `${id}.png`,
  isImage: true,
}));
const asset = {
  formatVersion: 1 as const,
  path: images[1]!.path,
  name: "two.png",
  mimeType: "image/png",
  blob: new Blob(["image"], { type: "image/png" }),
};
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
afterEach(() => {
  closeImageLightbox();
  vi.restoreAllMocks();
  reads.mockReset();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe("client attachment lightbox ownership", () => {
  it("does not create an unowned URL when another read already failed", async () => {
    let finish!: (value: ClientDraftAsset) => void;
    reads.mockRejectedValueOnce(new Error("missing asset")).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const create = vi.fn<(blob: Blob) => string>(() => "blob:late");
    const revoke = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    openAttachmentLightbox(images, 0);
    await waitFor(() => expect(report).toHaveBeenCalledOnce());
    finish(asset);
    await Promise.resolve();
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
  it("owns successful URLs until close and revokes them once", async () => {
    reads.mockResolvedValue(asset);
    let index = 0;
    const create = vi.fn<(blob: Blob) => string>(() => `blob:owned-${index++}`);
    const revoke = vi.fn<(url: string) => void>();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const revision = imageLightboxRevision();
    openAttachmentLightbox(images, 0);
    await waitFor(() => expect(imageLightboxRevision()).toBeGreaterThan(revision));
    expect(revoke).not.toHaveBeenCalled();
    closeImageLightbox();
    closeImageLightbox();
    expect(revoke.mock.calls).toEqual([["blob:owned-0"], ["blob:owned-1"]]);
  });
});
