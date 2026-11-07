import "@/renderer/testUtils/clientDraftDatabase";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { composerDraftStorage } from "@/renderer/state/composerDraftStorage";
import {
  preserveClientSubmission,
  readClientSubmission,
  serializeClientDraftMetadataWrite,
  type ClientDraftSubmission,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import { DraftRecoveryNotice } from "./DraftRecoveryNotice";
import * as clientDraftDatabase from "@/renderer/state/composerDrafts/clientDraftDatabase";

const content = {
  segments: [{ kind: "text" as const, content: "Preserved question" }],
  attachments: [],
};
async function saved(state: ClientDraftSubmission["state"]) {
  const record: ClientDraftSubmission = {
    formatVersion: 1,
    id: crypto.randomUUID(),
    draftId: "draft",
    scope: '["thread","t"]',
    revision: 1,
    target: "host",
    fingerprint: "content",
    content: { recoveryContent: content },
    state,
    assets: [],
  };
  await preserveClientSubmission(record);
  return record;
}
afterEach(() => vi.restoreAllMocks());

describe("submission recovery", () => {
  it.each(["different ID", "newer revision"] as const)(
    "keeps a recovery copy with %s visible when earlier cleanup finishes",
    async (replacement) => {
      const original = await saved("failed");
      render(
        <DraftRecoveryNotice kind="thread" ownerId="t" pending={false} onRestore={() => {}} />,
      );
      let finish!: (removed: string[]) => void;
      const cleanup = vi.spyOn(clientDraftDatabase, "reclaimClientDraftAssets").mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      fireEvent.click(await screen.findByRole("button", { name: "Discard saved copy" }));
      await waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
      await act(async () => {
        const operation =
          replacement === "different ID"
            ? saved("failed")
            : serializeClientDraftMetadataWrite((backup) => {
                backup({ ...original, revision: 2, fingerprint: "newer content" });
                throw new Error("another window changed the draft");
              });
        const result = await operation.then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(result).toEqual(
          replacement === "different ID"
            ? undefined
            : new Error("another window changed the draft"),
        );
      });
      await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled());
      await act(async () => {
        finish([]);
      });
      expect(screen.getByRole("button", { name: "Restore" })).toBeVisible();
    },
  );

  it("retains the recovery copy if the restored editor cannot be checkpointed", async () => {
    const record = await saved("failed");
    const report = vi.spyOn(toast, "danger").mockReturnValue("test-toast");
    render(
      <DraftRecoveryNotice
        kind="thread"
        ownerId="t"
        pending={false}
        onRestore={(draft) => composerDraftStorage()!.save("thread", "t", draft)}
      />,
    );
    const button = await screen.findByRole("button", { name: "Restore" });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });
    fireEvent.click(button);
    await waitFor(() => expect(report).toHaveBeenCalled());
    expect(await readClientSubmission(record.id)).toMatchObject({ state: "failed" });
    set.mockRestore();
  });

  it.each(["dispatching", "uncertain", "staged"] as const)(
    "makes %s work visible without replaying or deleting it on restore",
    async (state) => {
      const record = await saved(state);
      const restore = vi.fn<(draft: typeof content) => void>((draft) =>
        composerDraftStorage()!.save("thread", "t", draft),
      );
      render(<DraftRecoveryNotice kind="thread" ownerId="t" pending={false} onRestore={restore} />);
      fireEvent.click(await screen.findByRole("button", { name: "Restore a copy" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Restore a copy" })).toBeDisabled(),
      );
      expect(restore).toHaveBeenCalledExactlyOnceWith(content);
      expect(await readClientSubmission(record.id)).toMatchObject({ state });
      fireEvent.click(screen.getByRole("button", { name: "Discard saved copy" }));
      await waitFor(async () => expect(await readClientSubmission(record.id)).toBeUndefined());
      expect(composerDraftStorage()!.load("thread").t).toEqual(content);
    },
  );
});
