import { describe, expect, it } from "vitest";
import {
  parseActivateCliOptions,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseServerCliCommand,
} from "./cli";

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

  it("recognizes the staged-import activation command", () => {
    expect(parseServerCliCommand(["activate"])).toBe("activate");
    expect(parseServerCliCommand(["activate", "--json"])).toBe("activate");
    expect(parseServerCliCommand(["activate", "--sign-in-again", "--json"])).toBe("activate");
  });

  it("recognizes the read-only doctor command", () => {
    expect(parseServerCliCommand(["doctor"])).toBe("doctor");
    expect(parseServerCliCommand(["doctor", "--json"])).toBe("doctor");
    expect(parseServerCliCommand(["doctor", "--log-file", "/tmp/server.log"])).toBe("doctor");
    expect(parseServerCliCommand(["doctor", "--json", "--log-file", "/tmp/server.log"])).toBe(
      "doctor",
    );
  });

  it("recognizes the verified backup command", () => {
    expect(parseServerCliCommand(["backup", "--to", "/tmp/backup"])).toBe("backup");
    expect(parseServerCliCommand(["backup", "--json", "--to", "/tmp/backup"])).toBe("backup");
  });

  it.each(["--help", "-h", "help"])("recognizes %s without starting an owner", (argument) => {
    expect(parseServerCliCommand([argument])).toBe("help");
  });

  it.each([
    { args: ["pair"] },
    { args: ["serve", "pair"] },
    { args: ["--signal"] },
    { args: ["activate", "--serve"] },
    { args: ["doctor", "--serve"] },
    { args: ["backup", "--to"] },
    { args: ["backup"] },
  ])("rejects unsupported arguments (%j)", ({ args }) => {
    expect(() => parseServerCliCommand(args)).toThrow(/Usage/u);
  });
});

describe("parseActivateCliOptions", () => {
  it("defaults to cooperative migration with human output", () => {
    expect(parseActivateCliOptions([])).toEqual({ json: false, signInAgain: false });
  });

  it("parses the explicit flags in any order", () => {
    expect(parseActivateCliOptions(["--json"])).toEqual({ json: true, signInAgain: false });
    expect(parseActivateCliOptions(["--sign-in-again"])).toEqual({
      json: false,
      signInAgain: true,
    });
    expect(parseActivateCliOptions(["--sign-in-again", "--json"])).toEqual({
      json: true,
      signInAgain: true,
    });
  });

  it.each([["--serve"], ["restore"], ["--json=1"]])("rejects unknown flags (%s)", (flag) => {
    expect(() => parseActivateCliOptions([flag!])).toThrow(/Usage/u);
  });
});

describe("parseDoctorCliOptions", () => {
  it("defaults to human output without a log tail", () => {
    expect(parseDoctorCliOptions([])).toEqual({ json: false });
  });

  it("parses the log file flag with its value", () => {
    expect(parseDoctorCliOptions(["--log-file", "/tmp/server.log"])).toEqual({
      json: false,
      logFile: "/tmp/server.log",
    });
    expect(parseDoctorCliOptions(["--json", "--log-file", "/tmp/server.log"])).toEqual({
      json: true,
      logFile: "/tmp/server.log",
    });
  });

  it.each([["--log-file"], ["--json=1"], ["verbose"]])(
    "rejects unsupported arguments (%s)",
    (arg) => {
      expect(() => parseDoctorCliOptions([arg!])).toThrow(/Usage/u);
    },
  );
});

describe("parseBackupCliOptions", () => {
  it("requires the destination directory", () => {
    expect(parseBackupCliOptions(["--to", "/tmp/backup"])).toEqual({
      json: false,
      to: "/tmp/backup",
    });
    expect(parseBackupCliOptions(["--json", "--to", "/tmp/backup"])).toEqual({
      json: true,
      to: "/tmp/backup",
    });
    expect(() => parseBackupCliOptions([])).toThrow(/Usage/u);
    expect(() => parseBackupCliOptions(["--json"])).toThrow(/Usage/u);
  });

  it("rejects a destination-less --to flag and unknown flags", () => {
    expect(() => parseBackupCliOptions(["--to"])).toThrow(/Usage/u);
    expect(() => parseBackupCliOptions(["--to", "/tmp/backup", "--extra"])).toThrow(/Usage/u);
  });
});
