import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nativeJsonMcpConfig } from "./jsonConfig";
import { NativeMcpInstallation } from "./installation";

let root: string;
beforeEach(() => {
  mkdirSync("tmp/native-mcp-tests", { recursive: true });
  root = mkdtempSync("tmp/native-mcp-tests/case-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function fixture(text?: string) {
  const config = nativeJsonMcpConfig(
    join(root, "provider", "config.json"),
    (server) => server.transport,
    { comments: true },
  );
  if (text !== undefined) {
    mkdirSync(join(root, "provider"));
    writeFileSync(config.path, text);
  }
  return new NativeMcpInstallation(config, join(root, "app"));
}
describe("native configuration ownership", () => {
  it("inspection creates no provider or app files", () => {
    const installation = fixture();
    expect(installation.snapshot().owned).toEqual([]);
    expect(existsSync(join(root, "provider"))).toBe(false);
    expect(existsSync(join(root, "app"))).toBe(false);
  });
  it("writes native definitions, protects credentials, and preserves other settings on removal", () => {
    const installation = fixture(
      '{\n // keep this comment\n "unrelated": true, "mcpServers": {"existing": {"command":"keep"}}\n}',
    );
    installation.apply(
      installation.snapshot().revision,
      { proof: { command: "node", env: { TOKEN: "private-value" } } },
      [],
    );
    expect(installation.snapshot().owned).toEqual(["proof"]);
    expect(readFileSync(installation.manifestPath, "utf8")).not.toContain("private-value");
    installation.apply(installation.snapshot().revision, {}, ["proof"]);
    expect(installation.snapshot().entries).toEqual({ existing: { command: "keep" } });
    expect(readFileSync(installation.config.path, "utf8")).toContain("// keep this comment");
    expect(JSON.parse(readFileSync(installation.manifestPath, "utf8")).entries).toEqual({});
  });
  it("rejects existing entries without acquiring ownership or writing a manifest", () => {
    const installation = fixture('{"mcpServers":{"proof":{"command":"user"}}}');
    expect(() =>
      installation.apply(installation.snapshot().revision, { proof: { command: "new" } }, []),
    ).toThrow(/not owned/u);
    expect(existsSync(installation.manifestPath)).toBe(false);
  });
  it("preserves a user-edited installed entry", () => {
    const installation = fixture();
    installation.apply(installation.snapshot().revision, { proof: { command: "original" } }, []);
    writeFileSync(installation.config.path, '{"mcpServers":{"proof":{"command":"edited"}}}');
    expect(installation.snapshot().modified).toEqual(["proof"]);
    expect(() => installation.apply(installation.snapshot().revision, {}, ["proof"])).toThrow(
      /not owned/u,
    );
    expect(readFileSync(installation.config.path, "utf8")).toContain("edited");
  });
  it("rejects a stale preview without changing configuration", () => {
    const installation = fixture("{}");
    const revision = installation.snapshot().revision;
    writeFileSync(installation.config.path, '{"changed":true}');
    expect(() => installation.apply(revision, { proof: {} }, [])).toThrow(/changed/u);
    expect(existsSync(installation.manifestPath)).toBe(false);
  });
  it("rejects duplicate keys and unknown manifest versions", () => {
    const installation = fixture('{"mcpServers":{},"mcpServers":{}}');
    expect(() => installation.snapshot()).toThrow(/Duplicate/u);
    writeFileSync(installation.config.path, "{}");
    mkdirSync(join(root, "app", "native-mcp-config"), { recursive: true });
    writeFileSync(
      installation.manifestPath,
      JSON.stringify({ version: 0, configPath: installation.config.path, entries: {} }),
    );
    expect(() => installation.snapshot()).toThrow(/expected/u);
  });
  it.skipIf(process.platform === "win32")("does not replace a symlink or its target", () => {
    const installation = fixture("{}");
    const target = join(root, "original.json");
    writeFileSync(target, "{}");
    rmSync(installation.config.path);
    symlinkSync(join("..", "original.json"), installation.config.path);
    expect(() => installation.apply(installation.snapshot().revision, { proof: {} }, [])).toThrow(
      /symbolic/u,
    );
    expect(readFileSync(target, "utf8")).toBe("{}");
  });
});

it.skipIf(process.platform === "win32")(
  "writes native secrets with private POSIX permissions",
  () => {
    const installation = fixture();
    installation.apply(installation.snapshot().revision, { proof: { command: "node" } }, []);
    expect(statSync(installation.config.path).mode & 0o777).toBe(0o600);
  },
);

it.each(["constructor", "toString"])("can remove an owned server named %s", (name) => {
  const installation = fixture();
  installation.apply(installation.snapshot().revision, { [name]: { command: "node" } }, []);
  expect(installation.snapshot().owned).toContain(name);
  installation.apply(installation.snapshot().revision, {}, [name]);
  expect(Object.hasOwn(installation.snapshot().entries, name)).toBe(false);
});

it("rejects prototype setter entries before creating native files", () => {
  const installation = fixture();
  expect(() =>
    installation.apply(
      installation.snapshot().revision,
      { ["__proto__"]: { command: "node" } },
      [],
    ),
  ).toThrow(/Unsupported native configuration key/u);
  expect(existsSync(installation.config.path)).toBe(false);
});
