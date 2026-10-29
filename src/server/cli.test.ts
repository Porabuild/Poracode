import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import {
  parseActivateCliOptions,
  parseBackupCliOptions,
  parseDoctorCliOptions,
  parseInitTlsCliOptions,
  parsePairCliOptions,
  parseServerCliCommand,
  runCli,
  runDesktopCli,
  DESKTOP_CLI_INTEGRATION_VERSION,
} from "./cli";
import type { HostBuildIdentity } from "@/shared/hostControlProtocol";
import { assertTuiTerminal, parseStopCliOptions, parseTuiCliOptions } from "./cliParse";
import { queryCompletion, renderCompletion } from "../../packages/poracode-cli/lib/completion.mjs";
import { parseAdminCli, buildAdminCommand } from "./cliAdmin";
import { serverConfigFileSchema, SERVER_LOG_LEVELS } from "./serverConfig";
import { REMOTE_STANDARD_SCOPES } from "@/shared/remote/protocol/core";

describe("desktop packaged CLI entry", () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const build: HostBuildIdentity = {
    version: "2.0.0-captured",
    sourceRevision: null,
    root: resolve(__dirname, ".."),
    layoutKind: "prefix",
    entrypointSha256: "a".repeat(64),
  };
  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  });

  it("reports the captured build version without rereading mutable package metadata", () => {
    process.argv = ["electron", "bootstrap.mjs", "--version"];
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    runDesktopCli({ formatVersion: DESKTOP_CLI_INTEGRATION_VERSION, build });
    expect(output).toHaveBeenCalledExactlyOnceWith("2.0.0-captured\n");
  });

  it("refuses unsupported context versions and mismatched roots before dispatch", () => {
    process.argv = ["electron", "bootstrap.mjs", "--version"];
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    for (const input of [
      { formatVersion: 0, build },
      { formatVersion: 2, build },
      { formatVersion: 1, build, unknown: true },
      { formatVersion: 1, build: { ...build, root: resolve(__dirname, "other") } },
      { formatVersion: 1, build: { ...build, root: "relative" } },
      { formatVersion: 1, build: { ...build, layoutKind: "checkout" } },
      { formatVersion: 1, build: { ...build, entrypointSha256: null } },
    ])
      expect(() => runDesktopCli(input)).toThrow(Error);
    expect(output).not.toHaveBeenCalled();
  });

  it("refuses standalone upgrades before effects with actionable native runtime guidance", () => {
    process.argv = [
      "electron",
      "bootstrap.mjs",
      "upgrade",
      "--from",
      "owned-fixture.tar.gz",
      "--json",
    ];
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    runDesktopCli({ formatVersion: 1, build });
    expect(process.exitCode).toBe(1);
    expect(output.mock.calls.map(([value]) => String(value)).join("")).toContain("native Node.js");
  });
});

describe("standalone completion routing", () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  afterEach(() => {
    vi.restoreAllMocks();
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  });
  it.each([["bash"], ["--json"], ["--help"], ["--query", "1", "--current=", "--", "--base-dir"]])(
    "handles completion before profile extraction or runtime startup (%j)",
    (...args) => {
      process.argv = ["node", "server.cjs", "completion", ...args];
      const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      runCli();
      expect(output).toHaveBeenCalledExactlyOnceWith(renderCompletion(args));
    },
  );

  it("shares canonical pairing scopes and configuration enum values with existing command validators", () => {
    expect(queryCompletion(["pairings", "create", "--scope"], "").candidates).toEqual(
      REMOTE_STANDARD_SCOPES,
    );
    expect(queryCompletion(["configure", "--log-level"], "").candidates).toEqual(SERVER_LOG_LEVELS);
    expect([...queryCompletion(["configure", "--unset"], "").candidates].sort()).toEqual(
      [...serverConfigFileSchema.keyof().options].sort(),
    );
    for (const scope of queryCompletion(["pairings", "create", "--scope"], "").candidates)
      expect(
        buildAdminCommand(parseAdminCli(["pairings", "create", "--scope", scope])),
      ).toMatchObject({ scopes: [scope] });
    for (const bindMode of queryCompletion(["configure", "--bind-mode"], "").candidates)
      expect(serverConfigFileSchema.parse({ bindMode }).bindMode).toBe(bindMode);
    for (const logLevel of queryCompletion(["configure", "--log-level"], "").candidates)
      expect(serverConfigFileSchema.parse({ logLevel }).logLevel).toBe(logLevel);
    for (const field of queryCompletion(["configure", "--unset"], "").candidates)
      expect(serverConfigFileSchema.keyof().parse(field)).toBe(field);
  });

  it("does not suggest inline arguments for command parsers that reject them", () => {
    expect(queryCompletion(["serve"], "--config=private").mode).toBe("none");
    expect(() => parseServerCliCommand(["serve", "--config=private"])).toThrow(Error);
    expect(queryCompletion(["service", "start"], "--prefix=private").mode).toBe("none");
    expect(() => parseServerCliCommand(["service", "start", "--prefix=private"])).toThrow(Error);
    expect(queryCompletion(["mcp", "add", "exact-id"], "--config-file=private").mode).toBe("files");
    expect(
      parseAdminCli(["mcp", "add", "exact-id", "--config-file=private"]).values["config-file"],
    ).toBe("private");
  });
});

describe("parseServerCliCommand", () => {
  it("routes all completion operations for offline dispatch rather than server startup", () => {
    for (const args of [["bash"], ["--help"], ["--json"], ["--query", "1", "--current=", "--"]])
      expect(parseServerCliCommand(["completion", ...args])).toBe("completion");
  });
  it("routes guided setup without starting from help or accepting script flags", () => {
    expect(parseServerCliCommand(["setup"])).toBe("setup");
    expect(parseServerCliCommand(["setup", "--no-start"])).toBe("setup");
    expect(parseServerCliCommand(["setup", "--start", "--open"])).toBe("setup");
    expect(parseServerCliCommand(["setup", "--start", "--no-open"])).toBe("setup");
    expect(() => parseServerCliCommand(["setup", "--no-start", "--open"])).toThrow(Error);
    expect(parseServerCliCommand(["setup", "--help"])).toBe("help");
    expect(() => parseServerCliCommand(["setup", "--json"])).toThrow(Error);
  });

  it("requires an explicit prefix for native service operations", () => {
    expect(
      parseServerCliCommand(["service", "install", "--prefix", "/explicit-installed-prefix"]),
    ).toBe("service");
    expect(
      parseServerCliCommand([
        "service",
        "status",
        "--prefix",
        "/explicit-installed-prefix",
        "--json",
      ]),
    ).toBe("service");
    expect(parseServerCliCommand(["service", "--help"])).toBe("help");
    expect(() => parseServerCliCommand(["service", "install"])).toThrow("--prefix");
    expect(() =>
      parseServerCliCommand(["service", "start", "--prefix", "/explicit", "--force"]),
    ).toThrow("service");
  });
  it("serves by default", () => {
    expect(parseServerCliCommand([], false)).toBe("serve");
    expect(parseServerCliCommand(["--no-open"])).toBe("serve");
    expect(parseServerCliCommand(["serve", "--open"])).toBe("serve");
  });

  it("opens the TUI only for a bare interactive invocation", () => {
    expect(parseServerCliCommand([], true)).toBe("tui");
    expect(parseServerCliCommand([], false)).toBe("serve");
    expect(parseServerCliCommand(["--open"], true)).toBe("serve");
  });

  it("requires both terminal input and output for explicit TUI launches", () => {
    expect(() => assertTuiTerminal(true, true)).not.toThrow();
    expect(() => assertTuiTerminal(false, true)).toThrow("requires an interactive terminal");
    expect(() => assertTuiTerminal(true, false)).toThrow("requires an interactive terminal");
  });

  it("parses explicit TUI flags and one-shot print aliases", () => {
    expect(parseServerCliCommand(["tui"])).toBe("tui");
    expect(
      parseTuiCliOptions(["-c", "--session", "saved", "--prompt", "Continue", "--auto", "C:/repo"]),
    ).toEqual({
      continue: true,
      sessionId: "saved",
      prompt: "Continue",
      auto: true,
      directory: "C:/repo",
    });
    expect(() => parseTuiCliOptions(["one", "two"])).toThrow("Usage: poracode tui");
    expect(() => parseTuiCliOptions(["--unknown"])).toThrow("Unknown option");
    expect(parseServerCliCommand(["-p", "Reply with exactly: OK"])).toBe("print");
    expect(parseServerCliCommand(["--print", "Reply with exactly: OK"])).toBe("print");
    expect(parseServerCliCommand(["tui", "--help"])).toBe("help");
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
    expect(parseServerCliCommand(["pair", "--json", "--scope", "viewer"])).toBe("pair-json");
    expect(parsePairCliOptions(["--json"])).toEqual({ json: true });
    expect(parsePairCliOptions(["--json", "--scope", "viewer"])).toEqual({
      json: true,
      scope: "viewer",
    });
    expect(parsePairCliOptions(["--scope", "viewer"])).toEqual({ json: false, scope: "viewer" });
    expect(parseServerCliCommand(["pair"])).toBe("pair-json");
    expect(parseServerCliCommand(["connect"])).toBe("pair-json");
  });

  it("recognizes the authenticated owner status command", () => {
    expect(parseServerCliCommand(["status", "--json"])).toBe("status-json");
    expect(parseServerCliCommand(["status", "--details"])).toBe("status-json");
    expect(parseServerCliCommand(["status", "--json", "--details"])).toBe("status-json");
    for (const args of [["--details", "--details"], ["--json", "--json"], ["--start"]])
      expect(() => parseServerCliCommand(["status", ...args])).toThrow("Usage:");
  });

  it("recognizes the authenticated graceful stop command and rejects extra arguments", () => {
    expect(parseServerCliCommand(["stop"])).toBe("stop");
    expect(() => parseServerCliCommand(["stop", "--force"])).toThrow("stop");
    expect(parseServerCliCommand(["stop", "--if-pid", "4242"])).toBe("stop");
    expect(parseStopCliOptions(["--if-pid", "4242"])).toEqual({ expectedPid: 4242 });
    for (const value of ["0", "-1", "2.5", "2e3", "9007199254740992", ""])
      expect(() => parseStopCliOptions(["--if-pid", value])).toThrow("stop");
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

  it("recognizes the in-place upgrade command", () => {
    expect(parseServerCliCommand(["upgrade", "--from", "/tmp/a.tar.gz"])).toBe("upgrade");
    expect(parseServerCliCommand(["upgrade", "--from", "/tmp/a.tar.gz", "--json"])).toBe("upgrade");
  });

  it("recognizes the explicit upgrade recovery flags", () => {
    expect(parseServerCliCommand(["upgrade", "--resume", "--from", "/tmp/a.tar.gz"])).toBe(
      "upgrade",
    );
    expect(parseServerCliCommand(["upgrade", "--resume", "--confirm"])).toBe("upgrade");
    expect(parseServerCliCommand(["upgrade", "--abandon-journal", "--confirm"])).toBe("upgrade");
    expect(() => parseServerCliCommand(["upgrade", "--abandon-journal"])).toThrow(/Usage/u);
    expect(() =>
      parseServerCliCommand(["upgrade", "--resume", "--abandon-journal", "--confirm"]),
    ).toThrow(/Usage/u);
  });

  it("recognizes the verified backup command", () => {
    expect(parseServerCliCommand(["backup", "--to", "/tmp/backup"])).toBe("backup");
    expect(parseServerCliCommand(["backup", "--json", "--to", "/tmp/backup"])).toBe("backup");
  });

  it.each(["--help", "-h", "help"])("recognizes %s without starting an owner", (argument) => {
    expect(parseServerCliCommand([argument])).toBe("help");
  });

  it.each([
    "serve",
    "status",
    "stop",
    "doctor",
    "activate",
    "backup",
    "init-tls",
    "upgrade",
    "service",
    "setup",
    "configure",
  ])("routes %s help before required flags and operational validation", (command) => {
    expect(parseServerCliCommand([command, "--help"])).toBe("help");
    expect(parseServerCliCommand([command, "-h"])).toBe("help");
  });

  it.each([
    ["providers", "configure"],
    ["auth", "login"],
    ["clients", "revoke"],
    ["pairings", "create"],
    ["service", "install"],
    ["plugins", "refresh"],
    ["mcp", "inspect"],
    ["mcp", "add"],
    ["mcp", "configure"],
  ])("routes %s %s help without requiring a target or creating an operation", (command, action) => {
    expect(parseServerCliCommand([command, action, "--help"])).toBe("help");
    expect(parseServerCliCommand([command, action, "-h"])).toBe("help");
  });

  it("routes plugin/MCP administration without treating inventory commands as server startup", () => {
    expect(parseServerCliCommand(["plugins", "list", "--json"])).toBe("admin");
    expect(parseServerCliCommand(["mcp", "inspect", "exact-id"])).toBe("admin");
  });

  it.each(["--version", "-v", "version"])(
    "recognizes %s without starting an owner (plan D1/D3)",
    (argument) => {
      expect(parseServerCliCommand([argument])).toBe("version");
    },
  );

  it("recognizes the serve command with operability flags", () => {
    expect(parseServerCliCommand(["serve"])).toBe("serve");
    expect(parseServerCliCommand(["serve", "--config", "/tmp/p.json"])).toBe("serve");
    expect(parseServerCliCommand(["--host", "127.0.0.1"])).toBe("serve");
    expect(parseServerCliCommand(["--port", "49200"])).toBe("serve");
    expect(parseServerCliCommand(["serve", "--host", "0.0.0.0", "--port", "49200"])).toBe("serve");
  });

  it.each([
    { args: ["pair", "--secret"] },
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
