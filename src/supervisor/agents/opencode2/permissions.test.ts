import { describe, expect, it } from "vitest";
import { buildOpenCode2SessionPermissions } from "./permissions";
import { parsePermissionReply } from "./requestResponses";

describe("OpenCode 2 session permissions", () => {
  it.each(["yolo", "never"])(
    "allows full access for %s while keeping question forms interactive",
    (policy) => {
      expect(buildOpenCode2SessionPermissions(policy)).toEqual([
        { action: "*", resource: "*", effect: "allow" },
        { action: "question", resource: "*", effect: "allow" },
      ]);
    },
  );
  it.each(["default", undefined])("asks for tools under %s", (policy) => {
    expect(buildOpenCode2SessionPermissions(policy)[0]?.effect).toBe("ask");
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
