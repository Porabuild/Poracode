import { describe, expect, it } from "vitest";
import { decodeSettingsDocument } from "./settingsDocument";

describe("settings document migration", () => {
  it("migrates valid legacy fields before filling canonical defaults and retains unknown values", () => {
    const document = decodeSettingsDocument({
      prAutoMergeDefault: true,
      remoteAccessPreventSleep: true,
      futureField: { sealed: "lc-safe:v1:untouched" },
    });
    expect(document.settings).toMatchObject({
      prAutomationDefault: "merge",
      preventSleep: "while-remote-access",
    });
    expect(document.raw).toMatchObject({
      prAutomationDefault: "merge",
      preventSleep: "while-remote-access",
      futureField: { sealed: "lc-safe:v1:untouched" },
    });
    expect(document.settings).not.toHaveProperty("futureField");
  });

  it("accepts the documented legacy URL migration without losing future server fields", () => {
    const server = {
      id: "fixture",
      name: "fixture",
      enabled: true,
      description: "",
      timeoutMs: 30_000,
      transport: {
        type: "http",
        url: "https://user:secret@example.test/mcp#fragment",
        headers: {},
        futureTransport: "keep",
      },
      futureServer: "keep",
    };
    const document = decodeSettingsDocument({ mcpServers: [server] });
    expect(document.raw.mcpServers).toEqual([
      { ...server, transport: { ...server.transport, url: "https://example.test/mcp" } },
    ]);
    expect(JSON.stringify(document.settings.mcpServers)).not.toContain("future");
  });

  it("retains reserved unknown JSON keys without using them as object prototypes", () => {
    const document = decodeSettingsDocument(
      JSON.parse('{"browser":{"__proto__":{"future":true}},"__proto__":{"futureRoot":true}}'),
    );
    expect(Object.hasOwn(document.raw, "__proto__")).toBe(true);
    expect(JSON.stringify(document.raw)).toContain('"__proto__":{"futureRoot":true}');
    expect(Object.getPrototypeOf(document.raw)).toBe(Object.prototype);
    expect(JSON.stringify(document.settings)).not.toContain("future");
  });

  it("retains reserved unknown keys through legacy URL preprocessing", () => {
    const raw = JSON.parse(
      '{"__proto__":{"futureRoot":true},"mcpServers":[{"id":"fixture","name":"fixture","enabled":true,"description":"","timeoutMs":30000,"__proto__":{"futureServer":true},"transport":{"type":"http","url":"https://user:secret@example.test/mcp","headers":{},"__proto__":{"futureTransport":true}}}]}',
    );
    const document = decodeSettingsDocument(raw);
    expect(JSON.stringify(document.raw)).toContain('"__proto__":{"futureRoot":true}');
    expect(JSON.stringify(document.raw.mcpServers)).toContain('"__proto__":{"futureServer":true}');
    expect(JSON.stringify(document.raw.mcpServers)).toContain(
      '"__proto__":{"futureTransport":true}',
    );
    expect(JSON.stringify(document.settings)).not.toContain("future");
  });
});
