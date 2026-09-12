import { describe, expect, it } from "vitest";
import {
  getThreadFollowUpQueuePayloadSchema,
  pendingSteerStateSchema,
  removeQueuedThreadFollowUpPayloadSchema,
  resumeThreadFollowUpsPayloadSchema,
  setPendingSteerPayloadSchema,
  threadFollowUpQueueStateSchema,
} from "@/shared/contracts";
import { ipcProcedureMap, type IpcProcedureName } from "./procedureMap";
import {
  isRemoteFollowUpQueueProcedure,
  REMOTE_FOLLOW_UP_QUEUE_PROCEDURES,
  REMOTE_PROCEDURE_SPECS,
} from "../remote/procedures";

const queueProcedureNames = [
  "queueThreadFollowUp",
  "removeQueuedThreadFollowUp",
  "reorderQueuedThreadFollowUp",
  "editQueuedThreadFollowUp",
  "steerQueuedThreadFollowUp",
  "pauseThreadFollowUps",
  "resumeThreadFollowUps",
  "getThreadFollowUpQueue",
] as const satisfies readonly IpcProcedureName[];

describe("follow-up queue transport contracts", () => {
  it("exposes the exact supervisor procedures with strict payload schemas", () => {
    expect(REMOTE_FOLLOW_UP_QUEUE_PROCEDURES).toEqual(queueProcedureNames);
    for (const name of queueProcedureNames) {
      expect(ipcProcedureMap[name].transport).toBe("supervisor");
      expect(REMOTE_PROCEDURE_SPECS[name].owner).toBe("thread");
    }

    expect(
      ipcProcedureMap.queueThreadFollowUp.parseArgs({
        threadId: "thread-1",
        prompt: "Continue",
        config: { model: "gpt-5" },
      }),
    ).toEqual({
      threadId: "thread-1",
      prompt: "Continue",
      config: { model: "gpt-5" },
    });
    expect(
      ipcProcedureMap.removeQueuedThreadFollowUp.parseArgs({ threadId: "thread-1", id: "item-1" }),
    ).toEqual({ threadId: "thread-1", id: "item-1" });
    expect(ipcProcedureMap.resumeThreadFollowUps.parseArgs({ threadId: "thread-1" })).toEqual({
      threadId: "thread-1",
    });
    expect(ipcProcedureMap.getThreadFollowUpQueue.parseArgs({ threadId: "thread-1" })).toEqual({
      threadId: "thread-1",
    });
  });

  it("rejects malformed queue payloads and accepts the queue state wire shape", () => {
    expect(
      setPendingSteerPayloadSchema.safeParse({
        threadId: "thread-1",
        prompt: "",
        config: { model: "gpt-5" },
      }).success,
    ).toBe(false);
    expect(
      removeQueuedThreadFollowUpPayloadSchema.safeParse({ threadId: "thread-1" }).success,
    ).toBe(false);
    expect(resumeThreadFollowUpsPayloadSchema.safeParse({ threadId: "" }).success).toBe(false);
    expect(getThreadFollowUpQueuePayloadSchema.safeParse({ threadId: "thread-1" }).success).toBe(
      true,
    );

    expect(
      threadFollowUpQueueStateSchema.parse({
        paused: true,
        items: [
          {
            id: "item-1",
            prompt: "Continue",
            stagedAt: 1,
          },
        ],
      }),
    ).toEqual({
      paused: true,
      items: [{ id: "item-1", prompt: "Continue", stagedAt: 1 }],
    });
    expect(
      pendingSteerStateSchema.parse({
        id: "item-1",
        prompt: "Continue",
        segments: undefined,
        stagedAt: 1,
      }),
    ).toEqual({ id: "item-1", prompt: "Continue", stagedAt: 1 });
  });

  it("recognizes only the queue procedures for old-host compatibility handling", () => {
    for (const name of queueProcedureNames) {
      expect(isRemoteFollowUpQueueProcedure(name)).toBe(true);
    }
    expect(isRemoteFollowUpQueueProcedure("setPendingSteer")).toBe(false);
  });

  it("preserves edit concurrency tokens while accepting older clients", () => {
    const edit = { threadId: "thread-1", id: "item-1", prompt: "Updated" };
    expect(ipcProcedureMap.editQueuedThreadFollowUp.parseArgs(edit)).toEqual(edit);
    expect(
      ipcProcedureMap.editQueuedThreadFollowUp.parseArgs({ ...edit, expectedStagedAt: 123 }),
    ).toEqual({ ...edit, expectedStagedAt: 123 });
    expect(() =>
      ipcProcedureMap.editQueuedThreadFollowUp.parseArgs({
        ...edit,
        expectedStagedAt: "123" as unknown as number,
      }),
    ).toThrow("Invalid input");
  });
});
