import { describe, expect, it } from "vitest";
import type { OscNotification, OscTitle } from "@/shared/osc";
import { grokDetectionSpec } from "./detection";
import { createGrokAdapter } from "./index";

function oscTitle(text: string, code: 0 | 1 | 2 = 0): OscTitle {
  return { code, text };
}

function oscNotify(body: string, code: 9 | 99 | 777 = 9): OscNotification {
  return { code, title: "", body, payload: undefined };
}

// Observed live from `grok 0.1.218` PTY capture (idle → user prompt → response):
//   OSC 0 "grok"                       (idle, frequent)
//   OSC 0 "⠴ - Waiting - grok"         (working, braille frames ⠴ / ⠦)
//   OSC 9 "4;0;0"                      (iTerm2 progress: clear → idle)
// No OSC 777 / 99 / 133 / 633 / 1337 emitted in the same run.
describe("createGrokAdapter handleOscTitle", () => {
  const adapter = createGrokAdapter();

  it("maps Grok's '⠴/⠦ - Waiting - grok' braille spinner to working", () => {
    for (const glyph of ["⠴", "⠦"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} - Waiting - grok`))).toEqual({
        status: "working",
        attention: "working",
        corroborated: true,
      });
    }
  });

  it("accepts any braille glyph in the U+2800–U+28FF range", () => {
    for (const glyph of ["⠀", "⠁", "⣾", "⣿"]) {
      expect(adapter.handleOscTitle?.(oscTitle(`${glyph} task`))?.status).toBe("working");
    }
  });

  it("returns null for Grok's idle title (plain 'grok')", () => {
    expect(adapter.handleOscTitle?.(oscTitle("grok"))).toBeNull();
  });

  it("returns null when the braille glyph is not at the start of the title", () => {
    expect(adapter.handleOscTitle?.(oscTitle("grok ⠴"))).toBeNull();
  });
});

describe("createGrokAdapter handleOscNotification (iTerm2 OSC 9;4 progress)", () => {
  const adapter = createGrokAdapter();

  it("maps state 0 (remove progress) to idle — Grok's observed turn-end signal", () => {
    for (const body of ["4;0", "4;0;", "4;0;0"]) {
      expect(adapter.handleOscNotification?.(oscNotify(body))).toEqual({
        status: "idle",
        attention: "none",
        corroborated: true,
      });
    }
  });

  it("maps state 1 / 3 to working", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;1;42"))?.status).toBe("working");
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0"))?.status).toBe("working");
  });

  it("ignores OSC 9 bodies outside the 9;4 progress sub-protocol", () => {
    expect(adapter.handleOscNotification?.(oscNotify("Hello from some other agent"))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify(""))).toBeNull();
  });

  it("ignores OSC 777 / OSC 99 — Grok only emits iTerm2 OSC 9", () => {
    expect(adapter.handleOscNotification?.(oscNotify("4;0", 777))).toBeNull();
    expect(adapter.handleOscNotification?.(oscNotify("4;3;0", 99))).toBeNull();
  });
});

describe("createGrokAdapter OSC plumbing", () => {
  it("keeps OSC parsing active alongside the L1 hook plugin", () => {
    const adapter = createGrokAdapter();
    expect(adapter.oscHintsDeferToHookPlugin).toBeUndefined();
  });
});

describe("grokDetectionSpec", () => {
  it("uses device auth for WSL login to avoid localhost callback nonce mismatches", () => {
    expect(typeof grokDetectionSpec.loginCommand).toBe("function");
    const loginCommand =
      typeof grokDetectionSpec.loginCommand === "function"
        ? grokDetectionSpec.loginCommand({
            location: {
              kind: "wsl",
              distro: "Ubuntu",
              linuxPath: "/home/demo/project",
              uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
            },
            executablePath: "grok",
          })
        : grokDetectionSpec.loginCommand;

    expect(loginCommand).toBe("grok login --device-auth");
  });

  it("keeps normal OAuth login for native Windows", () => {
    const loginCommand =
      typeof grokDetectionSpec.loginCommand === "function"
        ? grokDetectionSpec.loginCommand({
            location: { kind: "windows", path: "C:\\repo" },
            executablePath: "grok",
          })
        : grokDetectionSpec.loginCommand;

    expect(loginCommand).toBe("grok login");
  });
});

describe("createGrokAdapter L1 hook plugin support", () => {
  it("declares lightcode-status@grok with protocol version 1", () => {
    const adapter = createGrokAdapter();
    expect(adapter.pluginId).toBe("lightcode-status@grok");
    expect(adapter.minProtocolVersion).toBe(1);
    expect(typeof adapter.pluginVersion).toBe("string");
    expect(adapter.pluginVersion?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns no extra args/env from pluginLaunchExtras (auto-loaded global hooks)", async () => {
    const adapter = createGrokAdapter();
    const extras = await adapter.pluginLaunchExtras?.({ envKind: "posix" });
    expect(extras).toEqual({});
    expect(extras?.args).toBeUndefined();
    expect(extras?.env).toBeUndefined();
  });
});
