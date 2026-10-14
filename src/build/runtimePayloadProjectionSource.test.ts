import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRuntimePayloadProjectionSource } from "./runtimePayloadProjectionSource.mjs";

describe("payload projection tooling source", () => {
  let root: string;
  let agents: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "poracode-projection source-"));
    agents = join(root, "src/supervisor/agents");
    mkdirSync(agents, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("imports file URLs with spaces and Unicode through the actual Node loader", () => {
    const folder = join(agents, "alpha λ");
    mkdirSync(folder);
    writeFileSync(
      join(folder, "persistedRuntimePayload.ts"),
      'export const runtimePayloadProjection = {formatOwnerKey:"alpha"};',
    );
    const { source } = createRuntimePayloadProjectionSource(root, { fileUrlImports: true });
    const output = execFileSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--disable-warning=ExperimentalWarning",
        "--input-type=module",
        "-e",
        "const m = await import('data:text/javascript;base64,' + Buffer.from(process.argv[1]).toString('base64')); console.log(JSON.stringify(m.runtimePayloadProjections.map(p => p.formatOwnerKey)));",
        source,
      ],
      { encoding: "utf8", timeout: 15_000 },
    );
    expect(JSON.parse(output)).toEqual(["alpha"]);
  });

  it("rejects more than 64 discovered projection leaves", () => {
    for (let i = 0; i < 65; i++) {
      const folder = join(agents, "fixture-" + i);
      mkdirSync(folder);
      writeFileSync(
        join(folder, "persistedRuntimePayload.ts"),
        "export const runtimePayloadProjection = {};",
      );
    }
    expect(() => createRuntimePayloadProjectionSource(root)).toThrow("module count exceeds64");
  });

  it.skipIf(process.platform === "win32")("rejects a linked projection source", () => {
    const folder = join(agents, "fixture");
    mkdirSync(folder);
    const outside = join(root, "outside.ts");
    writeFileSync(outside, "export const runtimePayloadProjection = {};");
    symlinkSync(outside, join(folder, "persistedRuntimePayload.ts"));
    expect(() => createRuntimePayloadProjectionSource(root)).toThrow("must not be a link");
  });
});
