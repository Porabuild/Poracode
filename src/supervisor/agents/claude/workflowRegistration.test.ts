import { expect, it } from "vitest";
import { recoverWorkflowRegistration } from "./workflowRegistration";
import {
  presentRuntimeWorkflow,
  runtimePresentationDigest,
} from "@/host/remote/server/runtimeItemPresentationProjection";

const result =
  "Workflow launched in background.\nSummary: Review the workspace\nTranscript dir: /session/subagents/workflows/run-legacy\nRun ID: run-legacy";

it("recovers an old reference without reading workflow scripts or mutating its payload", () => {
  const payload = {
    name: "Workflow",
    status: "success" as const,
    result,
    args: {
      get script(): string {
        throw new Error("Registration must not inspect scripts");
      },
    },
  };
  expect(recoverWorkflowRegistration(payload)).toEqual({
    runId: "run-legacy",
    transcriptDir: "/session/subagents/workflows/run-legacy",
    summary: "Review the workspace",
  });
  expect(Object.hasOwn(payload, "workflow")).toBe(false);
});

it("keeps canonical metadata ahead of old result text and rejects conflicting references", () => {
  expect(
    recoverWorkflowRegistration({
      name: "Workflow",
      status: "success",
      result,
      workflow: {
        runId: "current",
        transcriptDir: "/session/subagents/workflows/current",
        summary: "Current summary",
      },
    }),
  ).toMatchObject({ runId: "current", summary: "Current summary" });
  expect(
    recoverWorkflowRegistration({
      name: "Workflow",
      status: "success",
      result,
      workflow: { runId: "other" },
    }),
  ).toBeUndefined();
  expect(
    recoverWorkflowRegistration({ name: "ordinary", status: "success", result }),
  ).toBeUndefined();
});

it("projects legacy records with a digest that does not depend on script text", () => {
  const payload = { name: "Workflow", result, args: { script: "opaque code" } };
  const digest = runtimePresentationDigest("tool_call", "completed", payload, 3);
  expect(
    runtimePresentationDigest(
      "tool_call",
      "completed",
      { ...payload, args: { script: "changed code" } },
      3,
    ),
  ).toBe(digest);
  expect(presentRuntimeWorkflow("legacy", "tool_call", "completed", payload, digest)).toMatchObject(
    {
      status: "ready",
      header: { workflow: { runId: "run-legacy", summary: "Review the workspace" } },
    },
  );
  expect(
    presentRuntimeWorkflow(
      "legacy",
      "tool_call",
      "completed",
      { ...payload, result: "changed" },
      digest,
    ),
  ).toMatchObject({ reason: "changed" });
  const mcp = { ...payload, serverId: "external" };
  expect(
    presentRuntimeWorkflow(
      "legacy",
      "tool_call",
      "completed",
      mcp,
      runtimePresentationDigest("tool_call", "completed", mcp, 3),
    ),
  ).toMatchObject({ reason: "unsupported" });
  expect(
    presentRuntimeWorkflow("legacy", "mcp_tool_call", "completed", payload, digest),
  ).toMatchObject({ reason: "unsupported" });
});
