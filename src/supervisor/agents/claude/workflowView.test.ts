import { expect, it } from "vitest";
import { parseWorkflowPresentation } from "./workflowPresentation";
import { legacyWorkflowPayload } from "./workflowRegistration.testFixtures";
import {
  presentRuntimeWorkflowView,
  runtimePresentationDigest,
} from "@/host/remote/server/runtimeItemPresentationProjection";

const payload = {
  ...legacyWorkflowPayload({
    runId: "legacy",
    transcriptDir: "/session/subagents/workflows/legacy",
  }),
  args: {
    script:
      "const meta = { description: 'Review workspace', phases: [{ title: 'Inspect', detail: 'Read the code' }, { title: 'Verify' }] };",
  },
};

it("delivers exactly the PWA workflow interpretation on an explicit V4 read", () => {
  const before = structuredClone(payload);
  const digest = runtimePresentationDigest("tool_call", "completed", payload, 4);
  const expected = parseWorkflowPresentation(payload);
  const { manifestPath: _manifest, ...view } = expected;
  expect(presentRuntimeWorkflowView("item", "tool_call", "completed", payload, digest)).toEqual({
    status: "ready",
    itemId: "item",
    inputDigest: digest,
    header: { workflowView: view },
  });
  expect(view.phases).toHaveLength(2);
  expect(payload).toEqual(before);
});

it("fences changed arguments while preserving script-independent V3 registration digests", () => {
  const changed = { ...payload, args: { script: "changed" } };
  expect(runtimePresentationDigest("tool_call", "completed", payload, 3)).toBe(
    runtimePresentationDigest("tool_call", "completed", changed, 3),
  );
  const digest = runtimePresentationDigest("tool_call", "completed", payload, 4);
  expect(runtimePresentationDigest("tool_call", "completed", changed, 4)).not.toBe(digest);
  expect(
    presentRuntimeWorkflowView("item", "tool_call", "completed", changed, digest),
  ).toMatchObject({ status: "unavailable", reason: "changed" });
});

it("refuses external lookalikes, ordinary calls, incompatible types and unbounded output", () => {
  for (const input of [
    { ...payload, serverId: "external" },
    { name: "ordinary", status: "success", args: payload.args },
  ]) {
    expect(
      presentRuntimeWorkflowView(
        "item",
        "tool_call",
        "completed",
        input,
        runtimePresentationDigest("tool_call", "completed", input, 4),
      ),
    ).toMatchObject({ reason: "unsupported" });
  }
  expect(
    presentRuntimeWorkflowView("item", "mcp_tool_call", "completed", payload, "0".repeat(64)),
  ).toMatchObject({ reason: "unsupported" });
  const huge = { ...payload, args: { description: "x".repeat(4097) } };
  expect(
    presentRuntimeWorkflowView(
      "item",
      "tool_call",
      "completed",
      huge,
      runtimePresentationDigest("tool_call", "completed", huge, 4),
    ),
  ).toMatchObject({ reason: "too_large" });
});
