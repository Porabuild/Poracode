import { describe, expect, it } from "vitest";
import { buildOpenCodeSessionPermissions, sanitizeOpenCodeMcpId } from "./permissions";
import { parsePermissionReply } from "./requestResponses";

describe("OpenCode session permissions", () => {
  it.each(["yolo", "never"])(
    "allows full access for %s while keeping question forms interactive",
    (policy) => {
      expect(buildOpenCodeSessionPermissions(policy)).toEqual([
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
      ]);
    },
  );

  it.each(["default", undefined])("asks for tools under %s", (policy) => {
    expect(buildOpenCodeSessionPermissions(policy)[0]?.effect).toBe("ask");
  });

  it("appends sanitized deny rules after yolo catch-all rules for per-thread MCP isolation", () => {
    expect(
      buildOpenCodeSessionPermissions("yolo", {
        deniedMcpServers: ["github.com", "browser", "github.com"],
        disabledMcpTools: [
          { server: "poracode.cross", tool: "spawn/agent" },
          { server: "poracode.cross", tool: "delete" },
        ],
      }),
    ).toEqual([
      { action: "*", resource: "*", effect: "allow" },
      { action: "question", resource: "*", effect: "allow" },
      { action: "browser_*", resource: "*", effect: "deny" },
      { action: "github_com_*", resource: "*", effect: "deny" },
      { action: "poracode_cross_delete", resource: "*", effect: "deny" },
      { action: "poracode_cross_spawn_agent", resource: "*", effect: "deny" },
    ]);
    expect(sanitizeOpenCodeMcpId("foo:bar/baz")).toBe("foo_bar_baz");
  });

  it.each([
    [{ optionId: "once" }, "once"],
    [{ optionId: "always" }, "always"],
    [{ decision: "accept" }, "once"],
    [{ decision: "acceptForSession" }, "always"],
    [{ optionId: "reject" }, "reject"],
    [{ optionId: "reject-for-session" }, "reject"],
    [{}, "reject"],
    [null, "reject"],
    [{ action: "cancel" }, "reject"],
  ])("only allows explicit permission choices: %j", (response, expected) => {
    expect(parsePermissionReply(response)).toBe(expected);
  });
});
