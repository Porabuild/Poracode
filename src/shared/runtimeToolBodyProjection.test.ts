import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("poracode:tool-presentation-adapters", () => ({
  toolPresentationAdapters: [
    {
      workflowRegistrationNames: ["fixture-batch"],
      workflowResultErrorText: (text: string) =>
        text.startsWith("[rejected]") ? text.slice(10) : undefined,
    },
  ],
}));

import { presentRuntimeToolBody } from "./runtimeToolBodyProjection";
import { presentRuntimeToolBody as persistedRead } from "@/host/remote/server/runtimeItemPresentationProjection";
import { runtimePresentationDigest } from "./runtimeItemPresentationProjection";
import { runtimeItemPresentationResponseSchema } from "./contracts/runtimeItemPresentation";
import { runtimeItemPresentationSnapshot } from "./runtimeItemPresentationSnapshot";
import { presentToolResult } from "./toolResultPresentation";
import { workflowResultView } from "./workflowResult";
import { workflowResultBody } from "./workflowResultBody";
import type { RuntimeEvent } from "./contracts/runtimeEvent";

interface FixtureCase {
  id: string;
  type: string;
  state: string;
  payload: { name: string; status: string; result: unknown };
  entry: unknown;
}
const fixture = JSON.parse(
  readFileSync("protocol/remote/v3/fixtures/client-resolved-tool-body.json", "utf8"),
) as { version: number; cases: FixtureCase[] };

describe("resolved result blocks", () => {
  it.each(fixture.cases)("uses exactly the shared PWA meaning for $id", (item) => {
    const result = presentRuntimeToolBody(item.id, item.type, item.state, item.payload);
    expect(result).toEqual(item.entry);
    expect(runtimeItemPresentationResponseSchema.parse({ version: 5, items: [result] })).toEqual({
      version: 5,
      items: [result],
    });
    expect(result).toMatchObject({
      body: workflowResultBody(presentToolResult(item.payload).text),
    });
  });

  it("retains PWA row label/detail priority and complete supplemental falsy fields", () => {
    const body = workflowResultBody(
      JSON.stringify({
        findings: [
          {
            title: "Area",
            summary: "First",
            detail: "Other detail",
            count: 0,
            active: false,
            ref: null,
          },
        ],
      }),
    );
    expect(body).toEqual({
      blocks: [
        {
          kind: "disclosure-list",
          label: "results",
          countLabel: "1 title",
          rows: [
            {
              title: "Area",
              summary: "First",
              detail: "First",
              fields: [
                { label: "count", kind: "code", text: "0" },
                { label: "active", kind: "code", text: "false" },
                { label: "ref", kind: "code", text: "null" },
              ],
            },
          ],
        },
      ],
    });
    expect(workflowResultView('[{"title":"Area","summary":"First"}]')).toMatchObject({
      kind: "list",
      countLabel: "1 title",
    });
    expect(workflowResultBody("[rejected]wrapped error")).toEqual({ blocks: [] });
    expect(workflowResultBody('"quoted string"')).toEqual({
      blocks: [{ kind: "markdown", text: '"quoted string"' }],
    });
  });

  it("keeps result consistency separate from args and enforces the persisted read fence", () => {
    const payload = fixture.cases[0]!.payload;
    const digest = runtimePresentationDigest("tool_call", "completed", payload, 5);
    expect(
      runtimePresentationDigest(
        "tool_call",
        "completed",
        { ...payload, args: { script: "unrelated" } },
        5,
      ),
    ).toBe(digest);
    expect(
      persistedRead("x", "tool_call", "completed", { ...payload, result: "new" }, digest),
    ).toMatchObject({ reason: "changed" });
    expect(
      Reflect.apply(persistedRead, null, ["x", "tool_call", "completed", payload]),
    ).toMatchObject({ reason: "changed" });
    for (const state of ["started", "updated"])
      expect(presentRuntimeToolBody("x", "tool_call", state, payload)).toMatchObject({
        reason: "unsupported",
      });
    expect(
      presentRuntimeToolBody("x", "tool_call", "completed", { ...payload, status: "running" }),
    ).toMatchObject({ reason: "unsupported" });
    expect(presentRuntimeToolBody("x", "mcp_tool_call", "completed", payload)).toMatchObject({
      reason: "unsupported",
    });
    expect(
      presentRuntimeToolBody("x", "tool_call", "completed", { ...payload, serverId: "external" }),
    ).toMatchObject({ reason: "unsupported" });
    expect(
      presentRuntimeToolBody("x", "tool_call", "completed", {
        ...payload,
        result: "x".repeat(4 * 1024 * 1024),
      }),
    ).toMatchObject({ reason: "too_large" });
  });

  it("folds late names and shallow result replacements for transient snapshots without altering events", () => {
    const events: RuntimeEvent[] = [
      {
        type: "item.started",
        threadId: "agent",
        itemId: "x",
        itemType: "tool_call",
        payload: { name: "pending", status: "running", result: "before name" },
      },
      {
        type: "item.updated",
        threadId: "agent",
        itemId: "x",
        payload: { name: "fixture-batch", result: { text: "complete" } },
      },
      { type: "item.completed", threadId: "agent", itemId: "x", payload: { status: "success" } },
    ];
    const before = structuredClone(events);
    const hints = runtimeItemPresentationSnapshot(events, "agent");
    expect(hints?.items).toMatchObject([
      { version: 5, entry: { body: { blocks: [{ kind: "markdown", text: "complete" }] } } },
    ]);
    expect(events).toEqual(before);
    events.push({
      type: "item.updated",
      threadId: "agent",
      itemId: "x",
      payload: { result: null },
    });
    expect(runtimeItemPresentationSnapshot(events, "agent")?.items).toMatchObject([
      { version: 5, entry: { body: { blocks: [] } } },
    ]);
    expect(runtimeItemPresentationSnapshot(events, "foreign")).toBeUndefined();
  });

  it("never reads ordinary tool bodies or script fields to build result hints", () => {
    const payload = {
      name: "ordinary",
      status: "success",
      get result(): never {
        throw new Error("do not inspect body");
      },
    };
    expect(presentRuntimeToolBody("x", "tool_call", "completed", payload)).toMatchObject({
      reason: "unsupported",
    });
    expect(
      presentRuntimeToolBody("workflow", "tool_call", "completed", {
        name: "fixture-batch",
        status: "success",
        result: "complete",
        get args(): never {
          throw new Error("do not inspect script");
        },
      }),
    ).toMatchObject({ status: "ready" });
    const events: RuntimeEvent[] = [
      { type: "item.started", threadId: "agent", itemId: "x", itemType: "tool_call", payload },
      { type: "item.completed", threadId: "agent", itemId: "x" },
    ];
    expect(runtimeItemPresentationSnapshot(events, "agent")).toBeUndefined();
  });
});
