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
      version: 2,
      auth: "pairing",
      appVersion: "0.0.0",
      home: "C:/tui",
      pairingUrl: "http://127.0.0.1:49152/#token=one-time",
      directory: "C:/repo",
    });
    expect(readTuiBootstrap().version).toBe(2);
    expect(process.env.PORACODE_TUI_BOOTSTRAP).toBeUndefined();
  });

  test("refuses unknown and future versions", () => {
    process.env.PORACODE_TUI_BOOTSTRAP = JSON.stringify({ version: 3 });
    expect(readTuiBootstrap).toThrow(UnsupportedTuiBootstrapVersionError);
    expect(process.env.PORACODE_TUI_BOOTSTRAP).toBeUndefined();
  });
});
