import { describe, expect, it } from "vitest";
import { parseServerCliCommand } from "./cli";

describe("parseServerCliCommand", () => {
  it("serves by default", () => {
    expect(parseServerCliCommand([])).toBe("serve");
  });

  it("recognizes the explicit machine-readable pairing command", () => {
    expect(parseServerCliCommand(["pair", "--json"])).toBe("pair-json");
  });

  it("recognizes the authenticated owner status command", () => {
    expect(parseServerCliCommand(["status", "--json"])).toBe("status-json");
  });

  it.each(["--help", "-h", "help"])("recognizes %s without starting an owner", (argument) => {
    expect(parseServerCliCommand([argument])).toBe("help");
  });

  it.each([{ args: ["pair"] }, { args: ["serve", "pair"] }, { args: ["--signal"] }])(
    "rejects unsupported arguments (%j)",
    ({ args }) => {
      expect(() => parseServerCliCommand(args)).toThrow(/Usage/u);
    },
  );
});
