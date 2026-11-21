import { describe, expect, it } from "vitest";
import { deriveCommandPayloadIntent } from "@/shared/commandPresentation/payload";
import { runtimeItemPresentationResponseSchema } from "@/shared/contracts/runtimeItemPresentation";
import {
  presentRuntimeCommand,
  presentRuntimeMcpTool,
  runtimePresentationDigest,
} from "./runtimeItemPresentationProjection";

describe("advisory command headings", () => {
  it("retains the mandatory persisted-read fence for callers without a digest", () => {
    expect(
      Reflect.apply(presentRuntimeCommand, null, [
        "item",
        "command_execution",
        "completed",
        { command: "cat file.ts" },
      ]),
    ).toMatchObject({ status: "unavailable", reason: "changed" });
    expect(
      Reflect.apply(presentRuntimeMcpTool, null, [
        "item",
        "mcp_tool_call",
        "completed",
        { name: "search", serverId: "docs", status: "success" },
      ]),
    ).toMatchObject({ status: "unavailable", reason: "changed" });
  });
  it.each([
    { command: "sed -n '5,12p' src/App.tsx", cwd: "/project" },
    { command: "rg -n 'layout' src" },
    { command: "npm install" },
    { command: "git status", durationMs: 24, exitCode: 1 },
    { args: { command: "ls src", cwd: "/project" } },
    {
      command: "opaque",
      actions: [{ kind: "read", path: "src/App.tsx", command: "opaque", name: "App.tsx" }],
    },
  ])("uses the same command meaning as the PWA: %j", (payload) => {
    const inputDigest = runtimePresentationDigest("command_execution", "completed", payload);
    const result = presentRuntimeCommand(
      "item",
      "command_execution",
      "completed",
      payload,
      inputDigest,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected heading");
    expect(result.header.command).toEqual(deriveCommandPayloadIntent(payload));
    expect(
      runtimeItemPresentationResponseSchema.safeParse({ version: 1, items: [result] }).success,
    ).toBe(true);
  });

  it("rejects changed inputs, preserves falsy values and ignores unrelated bodies/streams", () => {
    const payload = { command: "echo ok", exitCode: 0, result: "before" };
    const digest = runtimePresentationDigest("command_execution", "completed", payload);
    expect(
      runtimePresentationDigest("command_execution", "completed", { ...payload, result: "after" }),
    ).toBe(digest);
    expect(
      presentRuntimeCommand(
        "x",
        "command_execution",
        "completed",
        { ...payload, exitCode: 1 },
        digest,
      ),
    ).toEqual({ status: "unavailable", itemId: "x", reason: "changed" });
    expect(
      presentRuntimeCommand("x", "command_execution", "running", payload, digest),
    ).toMatchObject({ reason: "changed" });
    expect(presentRuntimeCommand("x", "tool_call", "completed", payload, digest)).toMatchObject({
      reason: "unsupported",
    });
  });

  it("refuses excessive interpretation inputs and retains failure/duration meaning", () => {
    expect(
      presentRuntimeCommand(
        "x",
        "command_execution",
        "completed",
        { command: "x".repeat(4 * 1024 * 1024) },
        "0".repeat(64),
      ),
    ).toMatchObject({ reason: "too_large" });
    const payload = { command: "node test.js", status: "error", durationMs: 0 };
    const digest = runtimePresentationDigest("command_execution", "completed", payload);
    expect(
      presentRuntimeCommand("x", "command_execution", "completed", payload, digest),
    ).toMatchObject({ header: { failed: true, durationMs: 0 } });
    expect(payload).toEqual({ command: "node test.js", status: "error", durationMs: 0 });
  });
});

describe("opt-in MCP tool headings", () => {
  it.each(["tool_call", "dynamic_tool_call", "mcp_tool_call"])(
    "shares PWA labels for %s without body-dependent cache keys",
    (type) => {
      const payload = {
        name: "mcp__workspace_docs__search",
        status: "success",
        result: "large body",
      };
      const digest = runtimePresentationDigest(type, "completed", payload, 2);
      expect(runtimePresentationDigest(type, "completed", { ...payload, result: false }, 2)).toBe(
        digest,
      );
      const result = presentRuntimeMcpTool("mcp", type, "completed", payload, digest);
      expect(result).toMatchObject({
        status: "ready",
        inputDigest: digest,
        header: { tool: { kind: "mcp", title: "workspace docs: search" }, failed: false },
      });
      expect(
        runtimeItemPresentationResponseSchema.safeParse({ version: 2, items: [result] }).success,
      ).toBe(true);
      expect(
        runtimeItemPresentationResponseSchema.safeParse({ version: 1, items: [result] }).success,
      ).toBe(false);
      expect(
        presentRuntimeMcpTool("mcp", type, "completed", { ...payload, name: "changed" }, digest),
      ).toMatchObject({ reason: "changed" });
      expect(presentRuntimeCommand("mcp", type, "completed", payload, digest)).toMatchObject({
        reason: "unsupported",
      });
    },
  );

  it("supports canonical server ids, preserves failure state, and refuses non-MCP rows", () => {
    const payload = { name: "search", serverId: "Workspace_Docs", status: "error" };
    const digest = runtimePresentationDigest("mcp_tool_call", "completed", payload, 2);
    expect(
      presentRuntimeMcpTool("mcp", "mcp_tool_call", "completed", payload, digest),
    ).toMatchObject({
      header: { tool: { title: "Workspace Docs: search" }, failed: true },
    });
    const ordinary = { name: "some.tool", status: "success" };
    expect(
      presentRuntimeMcpTool(
        "other",
        "tool_call",
        "completed",
        ordinary,
        runtimePresentationDigest("tool_call", "completed", ordinary, 2),
      ),
    ).toMatchObject({ reason: "unsupported" });
  });
});
