import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { createAcpMapperState } from "../acp/canonicalMapping";
import { AcpSessionRequests } from "../acp/sessionRequests";
import { normalizeCommandCodePermissionRequest } from "./acpRequests";
import { resolveCommandCodeAcpMode } from "./acp";

function question(): RequestPermissionRequest {
  return {
    sessionId: "native-session",
    toolCall: {
      toolCallId: "question_1",
      title: "Scope: Which scope?",
      kind: "other",
      status: "pending",
      rawInput: { question: "Which scope?", options: ["Focused", "Broad"] },
    },
    options: [
      { optionId: "option_0", name: "Focused", kind: "allow_once" },
      { optionId: "option_1", name: "Broad", kind: "allow_once" },
    ],
  };
}

describe("Command Code native ACP questions", () => {
  it.each(["yolo", "bypass", "default"])(
    "waits for an answer under %s permissions and returns the exact option ID",
    async (approvalPolicy) => {
      const events = vi.fn<(events: RuntimeEvent[]) => void>();
      const attention = vi.fn<(attention: "needs_approval" | "needs_reply" | "working") => void>();
      const requests = new AcpSessionRequests({
        threadId: "thread-1",
        getPermissionContext: () => ({
          config: { model: "", approvalPolicy },
          availableModeIds: ["default", "bypass"],
        }),
        ensureMapperState: () => createAcpMapperState("thread-1"),
        emitRuntimeEvents: events,
        setRequestAttention: attention,
        createRequestId: () => "native-question",
      });
      const reply = requests.requestPermission(normalizeCommandCodePermissionRequest(question()));
      expect(attention).toHaveBeenCalledWith("needs_reply");
      expect(events.mock.calls[0]?.[0][0]).toMatchObject({
        type: "request.opened",
        requestType: "tool_user_input",
        payload: {
          details: {
            userInputForm: {
              questions: [
                {
                  question: "Scope: Which scope?",
                  options: [{ optionId: "option_0" }, { optionId: "option_1" }],
                },
              ],
            },
          },
        },
      });
      expect(requests.resolve("native-question", { answers: { "0": "option_1" } })).toBe(true);
      await expect(reply).resolves.toMatchObject({
        outcome: { outcome: "selected", optionId: "option_1" },
      });
      expect(
        events.mock.calls
          .flatMap(([batch]) => batch)
          .filter((event) => event.type === "request.resolved"),
      ).toEqual([expect.objectContaining({ requestId: "native-question", outcome: "answered" })]);
    },
  );

  it("never fabricates a choice for an unsupported custom answer", async () => {
    const requests = new AcpSessionRequests({
      threadId: "thread-1",
      getPermissionContext: () => ({ config: { model: "" }, availableModeIds: [] }),
      ensureMapperState: () => createAcpMapperState("thread-1"),
      emitRuntimeEvents: () => {},
      setRequestAttention: () => {},
      createRequestId: () => "question",
    });
    const reply = requests.requestPermission(normalizeCommandCodePermissionRequest(question()));
    requests.resolve("question", { answers: { "0": "Unsupported custom choice" } });
    await expect(reply).resolves.toMatchObject({ outcome: { outcome: "cancelled" } });
  });

  it("leaves actual tool permission requests untouched", () => {
    const request = question();
    request.toolCall.kind = "execute";
    request.toolCall.rawInput = { command: "pwd" };
    expect(normalizeCommandCodePermissionRequest(request)).toBe(request);
  });

  it.each(["yolo", "never", "bypass"])(
    "keeps native risk prompts interactive under %s",
    async (approvalPolicy) => {
      const attention = vi.fn<(attention: "needs_approval" | "needs_reply" | "working") => void>();
      const requests = new AcpSessionRequests({
        threadId: "thread-1",
        resolveMode: resolveCommandCodeAcpMode,
        getPermissionContext: () => ({
          config: { model: "", approvalPolicy },
          availableModeIds: ["default", "bypass"],
        }),
        ensureMapperState: () => createAcpMapperState("thread-1"),
        emitRuntimeEvents: () => {},
        setRequestAttention: attention,
        createRequestId: () => "risk",
      });
      const request: RequestPermissionRequest = {
        sessionId: "native-session",
        toolCall: {
          toolCallId: "risk-1",
          title: "Risky command",
          kind: "execute",
          rawInput: { command: "read-only fixture" },
        },
        options: [
          { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject_once", name: "Reject once", kind: "reject_once" },
        ],
        _meta: { risk: { kind: "destructive-command" } },
      };
      const reply = requests.requestPermission(normalizeCommandCodePermissionRequest(request));
      expect(attention).toHaveBeenCalledWith("needs_approval");
      requests.resolve("risk", { optionId: "reject_once" });
      await expect(reply).resolves.toEqual({
        outcome: { outcome: "selected", optionId: "reject_once" },
      });
    },
  );
});
