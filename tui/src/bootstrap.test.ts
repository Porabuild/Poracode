import { afterEach, describe, expect, test } from "bun:test";
import { readTuiBootstrap, UnsupportedTuiBootstrapVersionError } from "./bootstrap";

const previous = process.env.PORACODE_TUI_BOOTSTRAP;

afterEach(() => {
  if (previous === undefined) delete process.env.PORACODE_TUI_BOOTSTRAP;
  else process.env.PORACODE_TUI_BOOTSTRAP = previous;
});

describe("TUI bootstrap", () => {
  test("reads the payload once and deletes the environment variable", () => {
    process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({
      version: 3,
      auth: "pairing",
      appVersion: "0.0.0",
      home: "C:/tui",
      pairingUrl: "http://127.0.0.1:49152/#token=one-time",
      directory: "C:/repo",
    });
    expect(readTuiBootstrap().version).toBe(3);
    expect(process.env.PORACODE_TUI_BOOTSTRAP).toBeUndefined();
  });

  test("carries a paired remote server", () => {
    process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({
      version: 3,
      auth: "session",
      appVersion: "0.0.0",
      home: "C:/tui",
      directory: "C:/repo",
      server: { id: "s-0123456789ab", name: "mac" },
    });
    expect(readTuiBootstrap().server).toEqual({ id: "s-0123456789ab", name: "mac" });
  });

  test("refuses a v2 bootstrap from an older CLI", () => {
    process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({
      version: 2,
      auth: "session",
      appVersion: "0.0.0",
      home: "C:/tui",
      directory: "C:/repo",
    });
    expect(readTuiBootstrap).toThrow(UnsupportedTuiBootstrapVersionError);
  });

  test("refuses unknown and future versions", () => {
    process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({ version: 4 });
    expect(readTuiBootstrap).toThrow(UnsupportedTuiBootstrapVersionError);
    expect(process.env.PORACODE_TUI_BOOTSTRAP).toBeUndefined();
  });
});
