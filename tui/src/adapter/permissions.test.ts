import { describe, expect, test } from "bun:test";
import { selectPermissionOption } from "./permissions";

describe("permission option selection", () => {
  const options = [
    { optionId: "allow-once", name: "Allow once" },
    { optionId: "allow-always", name: "Always allow" },
    { optionId: "reject", name: "Reject" },
  ];

  test("selects once, always and reject options by their plain labels", () => {
    expect(selectPermissionOption(options, "once")).toBe("allow-once");
    expect(selectPermissionOption(options, "always")).toBe("allow-always");
    expect(selectPermissionOption(options, "reject")).toBe("reject");
  });

  test("falls back to the one-time option when no persistent option is offered", () => {
    expect(selectPermissionOption(options.slice(0, 1), "always")).toBe("allow-once");
  });

  test("prefers temporary options for once and session options for always", () => {
    const ordered = [
      { optionId: "forever", name: "Allow forever" },
      { optionId: "allow-session", name: "Allow for this session" },
      { optionId: "allow", name: "Continue" },
      { optionId: "deny-first", name: "Decline" },
      { optionId: "deny-second", name: "Reject" },
    ];
    expect(selectPermissionOption(ordered, "once")).toBe("allow");
    expect(selectPermissionOption(ordered, "always")).toBe("allow-session");
    expect(selectPermissionOption(ordered, "reject")).toBe("deny-first");
  });

  test("falls back to the first positive option for always when no persistent option exists", () => {
    expect(
      selectPermissionOption(
        [
          { optionId: "deny", name: "Deny" },
          { optionId: "continue", name: "Continue" },
        ],
        "always",
      ),
    ).toBe("continue");
  });
});
