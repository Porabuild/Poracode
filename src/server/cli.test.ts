import { describe, expect, it } from "vitest";
import {
  parseActivateCliOptions,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseInitTlsCliOptions,
  parseServerCliCommand,
} from "./cli";

describe("parseServerCliCommand", () => {
  it("serves by default", () => {
    expect(parseServerCliCommand([])).toBe("serve");
  });

  it("recognizes the TLS material generation command", () => {
    expect(parseServerCliCommand(["init-tls"])).toBe("init-tls");
    expect(parseServerCliCommand(["init-tls", "--json"])).toBe("init-tls");
    expect(parseServerCliCommand(["init-tls", "--cert", "/a/c.pem", "--key", "/a/k.pem"])).toBe(
      "init-tls",
    );
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

  it("recognizes the serve command with operability flags", () => {
    expect(parseServerCliCommand(["serve"])).toBe("serve");
    expect(parseServerCliCommand(["serve", "--config", "/tmp/p.json"])).toBe("serve");
    expect(parseServerCliCommand(["--host", "127.0.0.1"])).toBe("serve");
    expect(parseServerCliCommand(["--port", "49200"])).toBe("serve");
    expect(parseServerCliCommand(["serve", "--host", "0.0.0.0", "--port", "49200"])).toBe("serve");
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

describe("parseInitTlsCliOptions", () => {
  it("defaults to no explicit paths, accepts --cert/--key/--json", () => {
    expect(parseInitTlsCliOptions([])).toEqual({ json: false });
    expect(parseInitTlsCliOptions(["--json"])).toEqual({ json: true });
    expect(parseInitTlsCliOptions(["--cert", "/tls/c.pem", "--key", "/tls/k.pem"])).toEqual({
      json: false,
      certPath: "/tls/c.pem",
      keyPath: "/tls/k.pem",
    });
  });

  it.each([["--cert"], ["--key"], ["--out"]])(
    "rejects %s without a value or unknown flags",
    (arg) => {
      expect(() => parseInitTlsCliOptions([arg!])).toThrow(/Usage/u);
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
