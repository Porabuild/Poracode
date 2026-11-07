import "@/renderer/testUtils/clientDraftDatabase";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import {
  stageClientDraftAsset,
  listClientSubmissions,
  readClientSubmission,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import {
  preserveDraftSubmission,
  materializeDraftSegments,
  dispatchDraftSubmission,
  acceptDraftSubmission,
} from "./clientDraftSubmission";

const fixture = vi.hoisted(() => ({
  owner: null as {
    isCurrent(): boolean;
    withClient(run: (client: unknown) => Promise<unknown>): Promise<unknown>;
  } | null,
  save: vi.fn<(...args: unknown[]) => Promise<string>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ saveClipboardImage: fixture.save }) }));
vi.mock("@/renderer/state/entityHost", () => ({
  entityHost: () => fixture.owner,
  hostHandle: () => fixture.owner,
  isSameHost: () => true,
}));

const project: Project = {
  id: "p",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-11-01",
};
const content = (text: string) => ({
  segments: [{ kind: "text" as const, content: text }],
  attachments: [],
});
function preserve(text = "submitted", configuration = {}) {
  const draft = content(text);
  return preserveDraftSubmission({
    kind: "project",
    ownerId: "p",
    target: project,
    content: draft,
    segments: draft.segments,
    intent: "launch",
    configuration,
  });
}
beforeEach(() => {
  fixture.owner = null;
  fixture.save.mockReset().mockResolvedValue("/host/submitted.png");
});

describe("explicit draft submission", () => {
  it("uploads client bytes once at submission, preserving MIME and the original snapshot", async () => {
    const bytes = new Uint8Array([1, 255, 3]);
    const asset = stageClientDraftAsset(new Blob([bytes], { type: "image/png" }), "Image 1.png");
    await asset.saved;
    const attachment = {
      id: "image",
      path: asset.path,
      name: "Image 1.png",
      isImage: true,
      mimeType: "image/png",
    };
    const segments = [{ kind: "attachment" as const, path: asset.path, mimeType: "image/png" }];
    const submission = await preserveDraftSubmission({
      kind: "project",
      ownerId: "p",
      target: project,
      content: { segments: [], attachments: [attachment] },
      segments: [...segments, ...segments],
      intent: "launch",
      configuration: {},
    });
    expect(fixture.save).not.toHaveBeenCalled();
    expect(await readClientSubmission(submission.id)).toMatchObject({
      state: "prepared",
      assets: [asset.path],
    });
    expect(await materializeDraftSegments(project, submission.segments, "new-thread")).toEqual([
      { kind: "attachment", path: "/host/submitted.png", mimeType: "image/png" },
      { kind: "attachment", path: "/host/submitted.png", mimeType: "image/png" },
    ]);
    expect(fixture.save).toHaveBeenCalledExactlyOnceWith({
      threadId: "new-thread",
      data: bytes,
      extension: "png",
    });
    expect(submission.checkpoint.content.attachments[0]?.path).toBe(asset.path);
  });

  it("refuses a second send after an unknown outcome even when a generated branch changes", async () => {
    const submission = await preserve("submitted", { branch: "generated-first" });
    const send = vi.fn<() => Promise<void>>(async () => {
      throw new RemoteClientError("response lost", 502, "network_error", {
        requestMayHaveCommitted: true,
      });
    });
    await expect(dispatchDraftSubmission(submission, send)).rejects.toThrow("response lost");
    await expect(preserve("submitted", { branch: "generated-again" })).rejects.toThrow("confirm");
    expect(send).toHaveBeenCalledOnce();
    expect(await readClientSubmission(submission.id)).toMatchObject({ state: "uncertain" });
  });

  it("permits an explicit retry after a definite refusal", async () => {
    const first = await preserve();
    await expect(
      dispatchDraftSubmission(first, async () => {
        throw new Error("refused before effect");
      }),
    ).rejects.toThrow("refused");
    const retry = await preserve();
    expect(retry.checkpoint.draftId).toBe(first.checkpoint.draftId);
    expect(retry.checkpoint.revision).toBe(first.checkpoint.revision);
    expect(await listClientSubmissions()).toEqual([expect.objectContaining({ id: retry.id })]);
  });

  it("refuses a replaced target immediately before dispatch", async () => {
    let current = true;
    fixture.owner = { isCurrent: () => current, withClient: async (run) => run({}) };
    const submission = await preserve();
    current = false;
    const send = vi.fn<() => Promise<void>>(async () => undefined);
    await expect(dispatchDraftSubmission(submission, send)).rejects.toThrow(
      "Remote server not found",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("does not upload to a replacement owner while preserving a send", async () => {
    let originalCurrent = true;
    fixture.owner = { isCurrent: () => originalCurrent, withClient: async (run) => run({}) };
    const asset = stageClientDraftAsset(
      new Blob(["private bytes"], { type: "image/png" }),
      "private.png",
    );
    await asset.saved;
    const submission = await preserve();
    originalCurrent = false;
    const upload = vi.fn<() => Promise<string>>().mockResolvedValue("/replacement/private.png");
    fixture.owner = {
      isCurrent: () => true,
      withClient: async (run) => run({ uploadAttachment: upload }),
    };
    await expect(
      materializeDraftSegments(
        project,
        [{ kind: "attachment", path: asset.path }],
        "thread",
        submission.isTargetCurrent,
      ),
    ).rejects.toThrow("Remote server not found");
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a missing paired owner before uploading through the managed fallback", async () => {
    const asset = stageClientDraftAsset(new Blob(["private bytes"]), "private.png");
    await asset.saved;
    await expect(
      materializeDraftSegments(
        { ...project, remoteServerId: "deleted-host" },
        [{ kind: "attachment", path: asset.path }],
        "thread",
      ),
    ).rejects.toThrow("Remote server not found");
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it("leaves newer typing intact when an older send is accepted", async () => {
    const submission = await preserve();
    await dispatchDraftSubmission(submission, async () => undefined);
    composerDraftStorage()!.save("project", "p", content("next message"));
    const clear = vi.fn<() => void>();
    expect(await acceptDraftSubmission(submission, clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(composerDraftStorage()!.load("project").p).toEqual(content("next message"));
    expect(await listClientSubmissions()).toEqual([]);
  });

  it("keeps a known acceptance receipt if local cleanup fails", async () => {
    const submission = await preserve();
    await dispatchDraftSubmission(submission, async () => undefined);
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    try {
      await expect(acceptDraftSubmission(submission)).rejects.toMatchObject({
        code: "client_draft_retirement_failed",
        requestMayHaveCommitted: true,
      });
      expect(await readClientSubmission(submission.id)).toMatchObject({ state: "accepted" });
    } finally {
      remove.mockRestore();
    }
    await acceptDraftSubmission(submission);
    expect(composerDraftStorage()!.load("project").p).toBeUndefined();
  });
});
