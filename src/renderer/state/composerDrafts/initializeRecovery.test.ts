import "@/renderer/testUtils/clientDraftDatabase";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import {
  dispatchDraftSubmission,
  preserveDraftSubmission,
} from "@/renderer/actions/clientDraftSubmission";
import { composerDraftStorage } from "../composerDraftStorage";
import {
  listClientSubmissions,
  readClientDraftAsset,
  readClientSubmission,
  stageClientDraftAsset,
  updateClientSubmission,
} from "./clientDraftDatabase";
import { initializeClientDraftRecovery } from "./initializeRecovery";

const thread = { id: "t", config: {} } as Thread;
const content = (text: string) => ({
  segments: [{ kind: "text" as const, content: text }],
  attachments: [],
});

/** Replays the earlier build's queue/steer receipt, which kept a "staged" copy. */
async function stageLegacyReceipt(text: string, assetPath?: string) {
  const attachments = assetPath
    ? [{ id: assetPath, path: assetPath, name: "shot.png", isImage: true, mimeType: "image/png" }]
    : [];
  const draft = { segments: content(text).segments, attachments };
  const submission = await preserveDraftSubmission({
    kind: "thread",
    ownerId: thread.id,
    target: thread,
    content: draft,
    segments: [
      ...attachments.map((attachment) => ({
        kind: "attachment" as const,
        path: attachment.path,
        mimeType: attachment.mimeType,
      })),
      ...draft.segments,
    ],
    intent: "queue",
    configuration: { config: thread.config },
  });
  await dispatchDraftSubmission(submission, async () => undefined);
  await updateClientSubmission(submission.id, "staged");
  await composerDraftStorage()!.acknowledge(submission.checkpoint);
  return submission;
}

describe("client draft recovery startup", () => {
  it("retires queue and steer receipts that an earlier build kept as staged copies", async () => {
    const storage = composerDraftStorage()!;
    const asset = stageClientDraftAsset(new Blob(["image"], { type: "image/png" }), "shot.png");
    await asset.saved;
    const staged = await stageLegacyReceipt("queued", asset.path);
    expect(await readClientSubmission(staged.id)).toMatchObject({
      state: "staged",
      assets: [asset.path],
    });
    const rejected = await preserveDraftSubmission({
      kind: "thread",
      ownerId: thread.id,
      target: thread,
      content: content("rejected"),
      segments: content("rejected").segments,
      intent: "send",
      configuration: { config: thread.config },
    });
    await updateClientSubmission(rejected.id, "failed");
    const failed = await readClientSubmission(rejected.id);
    storage.save("thread", thread.id, content("newer typing"));
    await storage.flushRequired();

    await initializeClientDraftRecovery();

    expect(await listClientSubmissions()).toEqual([failed]);
    expect(storage.load("thread")[thread.id]).toEqual(content("newer typing"));
    expect(useAppStore.getState().threadDraftContents[thread.id]).toEqual(content("newer typing"));
    await vi.waitFor(() =>
      expect(readClientDraftAsset(asset.path)).rejects.toThrow("transaction failed"),
    );
  });

  it("settles legacy receipts without a storage error when two windows start together", async () => {
    await stageLegacyReceipt("first");
    await stageLegacyReceipt("second");
    const failures = vi.fn<() => void>();
    window.addEventListener("poracode:composer-draft-save-failed", failures);
    try {
      await Promise.all([initializeClientDraftRecovery(), initializeClientDraftRecovery()]);
    } finally {
      window.removeEventListener("poracode:composer-draft-save-failed", failures);
    }
    expect(failures).not.toHaveBeenCalled();
    expect(await listClientSubmissions()).toEqual([]);
  });
});
