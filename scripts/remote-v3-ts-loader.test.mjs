import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

void test("TypeScript source tools preserve enums and parameter properties without Node transform flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-ts-loader-"));
  try {
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(
      join(root, "model.ts"),
      "export enum State { Ready = 'ready' }; " +
        "export class Model { constructor(public state: State) {} }",
    );
    const entry = join(root, "entry.ts");
    await writeFile(
      entry,
      "import { Model, State } from './model'; console.log(new Model(State.Ready).state);",
    );
    const output = execFileSync(
      process.execPath,
      ["--import", new URL("./remote-v3-ts-register.mjs", import.meta.url).href, entry],
      { encoding: "utf8", timeout: 15_000 },
    );
    assert.equal(output.trim(), "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
