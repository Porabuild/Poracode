import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import {
  CHECKPOINT_REVERT_COMMAND_ID_PREFIX,
  CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH,
  checkpointRevertPayloadSchema,
} from "@/shared/contracts";
import {
  findCheckpointBeforeUserMessage,
  mintCheckpointOperationKey,
} from "./checkpointRevertIdentity";

/**
 * Mirror of the remote router gate (`remoteCommandId` in
 * src/main/remote/server/httpRouter.ts): the whole command-id header value
 * must match this regex or the mutation is rejected with 400
 * invalid_command_id.
 */
const ROUTER_COMMAND_ID_GATE = /^[A-Za-z0-9._:-]{1,128}$/;

function chatItem(
  id: string,
  type: RuntimeChatItem["type"],
  extra: Partial<RuntimeChatItem> = {},
): RuntimeChatItem {
  return { id, type, state: "completed", streams: {}, ...extra };
}

describe("mintCheckpointOperationKey", () => {
  it("keeps key + command-id prefix inside the router gate for the worst realistic thread ids", () => {
    const serverId = "12345678-90ab-4cde-8f01-234567890abc";
    // The projected 67-char form reported overflowing the gate...
    const reportedProjected = remoteThreadId(serverId, "abcdef1234567890");
    expect(reportedProjected.length).toBe(67);
    // ...and an even wider host id, for headroom.
    const wideProjected = remoteThreadId(serverId, "12345678-90ab-4cde-8f01-234567890abc");
    for (const threadId of [reportedProjected, wideProjected]) {
      const key = mintCheckpointOperationKey();
      const header = `${CHECKPOINT_REVERT_COMMAND_ID_PREFIX}${key}`;
      expect(header.length).toBeLessThanOrEqual(128);
      expect(header).toMatch(ROUTER_COMMAND_ID_GATE);
      expect(() =>
        checkpointRevertPayloadSchema.parse({
          threadId,
          checkpointItemId: "root",
          operationKey: key,
        }),
      ).not.toThrow();
    }
  });

  it("mints bounded, unique keys in the schema charset", () => {
    const first = mintCheckpointOperationKey();
    const second = mintCheckpointOperationKey();
    expect(first).toMatch(/^ckpt-revert\.[0-9a-f-]{36}$/);
    expect(second).toMatch(/^ckpt-revert\.[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH);
  });

  it("budgets the schema max as the router gate minus the command-id prefix", () => {
    expect(CHECKPOINT_REVERT_COMMAND_ID_PREFIX).toBe("checkpoint-revert:");
    expect(CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH).toBe(110);
    expect(
      CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH + CHECKPOINT_REVERT_COMMAND_ID_PREFIX.length,
    ).toBe(128);
    // A key at the budget passes the schema; one char over must fail the
    // schema rather than reach the router as an overflowing header.
    expect(() =>
      checkpointRevertPayloadSchema.parse({
        threadId: "thread-1",
        checkpointItemId: "root",
        operationKey: "a".repeat(CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH),
      }),
    ).not.toThrow();
    expect(() =>
      checkpointRevertPayloadSchema.parse({
        threadId: "thread-1",
        checkpointItemId: "root",
        operationKey: "a".repeat(CHECKPOINT_REVERT_OPERATION_KEY_MAX_LENGTH + 1),
      }),
    ).toThrow(ZodError);
  });
});

describe("findCheckpointBeforeUserMessage", () => {
  // Capture side: a closing turn anchors on its last visible top-level item
  // (`appendCompletedTurnIfClosed`) and `finalizeFileCheckpoint` stores the
  // turn snapshot under that id. Turn 1 below closed on a TOOL row, so the
  // stored checkpoint id is "tool-1" — whatever id the revert side returns
  // must be that same anchor, not an older assistant message.
  const itemIds = ["user-1", "assistant-1", "tool-1", "user-2"];
  const itemsById: Record<string, RuntimeChatItem> = {
    "user-1": chatItem("user-1", "user_message"),
    "assistant-1": chatItem("assistant-1", "assistant_message"),
    "tool-1": chatItem("tool-1", "tool_call", { payload: { name: "edit_file" } }),
    "user-2": chatItem("user-2", "user_message"),
  };

  it("returns the capture-side anchor (a tool row) for the following user message", () => {
    expect(findCheckpointBeforeUserMessage(itemIds, itemsById, "user-2")).toBe("tool-1");
  });

  it("still returns an assistant anchor when the turn closed on one", () => {
    const ids = ["user-1", "assistant-1", "user-2"];
    expect(
      findCheckpointBeforeUserMessage(
        ids,
        {
          "user-1": chatItem("user-1", "user_message"),
          // Stream text keeps the completed assistant row visible.
          "assistant-1": chatItem("assistant-1", "assistant_message", {
            streams: { assistant_text: "First answer" },
          }),
          "user-2": chatItem("user-2", "user_message"),
        },
        "user-2",
      ),
    ).toBe("assistant-1");
  });

  it("skips an empty completed assistant boundary with no other anchor", () => {
    // A blank stream-boundary assistant row has no timeline entry, so a turn
    // that closed on one must not satisfy the lookup.
    const ids = ["user-1", "assistant-1", "user-2"];
    expect(
      findCheckpointBeforeUserMessage(
        ids,
        {
          "user-1": chatItem("user-1", "user_message"),
          "assistant-1": chatItem("assistant-1", "assistant_message"),
          "user-2": chatItem("user-2", "user_message"),
        },
        "user-2",
      ),
    ).toBe(null);
  });

  it("skips sub-agent children and rows without a timeline entry", () => {
    const ids = ["user-1", "child-1", "plan-1", "tool-1", "user-2"];
    expect(
      findCheckpointBeforeUserMessage(
        ids,
        {
          "user-1": chatItem("user-1", "user_message"),
          "child-1": chatItem("child-1", "tool_call", {
            payload: { name: "nested" },
            parentItemId: "tool-1",
          }),
          "plan-1": chatItem("plan-1", "plan"),
          "tool-1": chatItem("tool-1", "tool_call", { payload: { name: "edit_file" } }),
          "user-2": chatItem("user-2", "user_message"),
        },
        "user-2",
      ),
    ).toBe("tool-1");
  });

  it("returns null for the first user message", () => {
    expect(findCheckpointBeforeUserMessage(["user-1", "assistant-1"], itemsById, "user-1")).toBe(
      null,
    );
  });

  it("agrees on the managed/local and remote-projected store slices", () => {
    // Projection rewrites thread ids only; item ids stay host-native, so both
    // slices carry the same capture-side anchor and the lookup must agree.
    const serverId = "12345678-90ab-4cde-8f01-234567890abc";
    const slices: Record<string, Record<string, RuntimeChatItem>> = {
      "thread-local": itemsById,
      [remoteThreadId(serverId, "abcdef1234567890")]: itemsById,
    };
    for (const slice of Object.values(slices)) {
      expect(findCheckpointBeforeUserMessage(itemIds, slice, "user-2")).toBe("tool-1");
    }
  });
});
