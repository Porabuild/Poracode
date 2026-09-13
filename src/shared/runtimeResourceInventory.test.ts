import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { stageAgentPlugins } from "../../scripts/prepare-agent-plugins.mjs";
import {
  runtimeDirectoryFiles,
  runtimeResourceIdentity,
  sourceAgentPluginFiles,
  verifyRuntimeResources,
} from "./runtimeResourceInventory";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-resource-declaration-"));
  roots.push(root);
  const source = join(root, "sources");
  const stage = join(root, "stage");
  const bundled = join(root, "bundled");
  mkdirSync(join(source, "plugin", "forward-runtime"), { recursive: true });
  mkdirSync(bundled);
  writeFileSync(
    join(source, "plugin", "forward-runtime", "poracode-hook-runtime.mjs"),
    "export {};\n",
  );
  const add = (kind: string) => {
    const path = join(source, kind, "plugin");
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "plugin.json"), JSON.stringify({ name: kind, version: "1" }));
    writeFileSync(join(path, "forward.mjs"), "export {};\n");
  };
  add("fixture-one");
  const declaration = () => [
    runtimeResourceIdentity("agent-plugins", sourceAgentPluginFiles(source)),
  ];
  const verify = (expected: ReturnType<typeof declaration>, layout: "source" | "staged") =>
    verifyRuntimeResources(expected, {
      agentPlugins: { path: layout === "source" ? source : stage, layout },
      bundledPlugins: bundled,
    });
  vi.spyOn(console, "log").mockImplementation(() => {});
  return { root, source, stage, bundled, add, declaration, verify };
}

it("refuses changed, added and removed discovered resources before a rebuild", () => {
  const value = fixture();
  const first = value.declaration();
  value.verify(first, "source");
  writeFileSync(join(value.source, "fixture-one", "plugin", "plugin.json"), '{"version":"2"}');
  expect(() => value.verify(first, "source")).toThrow(/declaration differs/);
  const second = value.declaration();
  value.add("fixture-two");
  expect(() => value.verify(second, "source")).toThrow(/declaration differs/);
  const third = value.declaration();
  rmSync(join(value.source, "fixture-two"), { recursive: true });
  expect(() => value.verify(third, "source")).toThrow(/declaration differs/);
});

it("qualifies source and staged layouts identically after explicit preparation", () => {
  const value = fixture();
  stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase: value.stage });
  expect(() => value.verify(value.declaration(), "staged")).not.toThrow();
  value.add("fixture-two");
  stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase: value.stage });
  expect(() => value.verify(value.declaration(), "staged")).not.toThrow();
  rmSync(join(value.source, "fixture-one"), { recursive: true });
  stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase: value.stage });
  // A normal rebuild must not keep a deleted package in its app-owned output.
  expect(() => value.verify(value.declaration(), "staged")).not.toThrow();
});

it("includes bundled plugin manifest and skill changes in resource identity", () => {
  const value = fixture();
  const first = runtimeResourceIdentity("bundled-plugins", runtimeDirectoryFiles(value.bundled));
  mkdirSync(join(value.bundled, "fixture"));
  writeFileSync(join(value.bundled, "fixture", "plugin.json"), "{}");
  expect(
    runtimeResourceIdentity("bundled-plugins", runtimeDirectoryFiles(value.bundled)),
  ).not.toEqual(first);
  const second = runtimeResourceIdentity("bundled-plugins", runtimeDirectoryFiles(value.bundled));
  writeFileSync(join(value.bundled, "fixture", "SKILL.md"), "Synthetic instruction.");
  expect(
    runtimeResourceIdentity("bundled-plugins", runtimeDirectoryFiles(value.bundled)),
  ).not.toEqual(second);
});

it("refuses overlapping staging roots before source cleanup or copy", () => {
  const value = fixture();
  const manifest = join(value.source, "fixture-one", "plugin", "plugin.json");
  const before = readFileSync(manifest);
  expect(() =>
    stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase: value.source }),
  ).toThrow(/overlap/);
  expect(readFileSync(manifest)).toEqual(before);
});

it("refuses a linked output subtree before copying or pruning its target", () => {
  const value = fixture();
  const outside = join(value.root, "outside");
  mkdirSync(outside);
  mkdirSync(value.stage);
  writeFileSync(join(outside, "plugin.json"), "preserve this synthetic file");
  symlinkSync(
    outside,
    join(value.stage, "fixture-one"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(() =>
    stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase: value.stage }),
  ).toThrow(/symbolic link/);
  expect(readFileSync(join(outside, "plugin.json"), "utf8")).toBe("preserve this synthetic file");
});

it.each(["same-root", "uncreated-child"])(
  "preserves every source byte when a parent alias makes staging overlap (%s)",
  (kind) => {
    const value = fixture();
    writeFileSync(join(value.source, "preserve-source.txt"), "Original source must remain.");
    const sourceBytes = () =>
      Object.fromEntries(
        runtimeDirectoryFiles(value.source).map((file) => [
          file.path,
          readFileSync(file.source, "utf8"),
        ]),
      );
    const before = sourceBytes();
    const alias = join(value.root, "alias");
    symlinkSync(value.root, alias, process.platform === "win32" ? "junction" : "dir");
    const destinationBase =
      kind === "same-root" ? join(alias, "sources") : join(alias, "sources", "generated", "nested");
    let error: string | undefined;
    try {
      stageAgentPlugins({ sourceAgentsDir: value.source, destinationBase });
    } catch (caught) {
      error = String(caught);
    }
    expect({ error, source: sourceBytes() }).toEqual({
      error: expect.stringMatching(/overlap/),
      source: before,
    });
  },
);

it("reuses separate staged assets through a parent alias without rewriting them", () => {
  const value = fixture();
  const alias = join(value.root, "alias");
  symlinkSync(value.root, alias, process.platform === "win32" ? "junction" : "dir");
  const options = { sourceAgentsDir: value.source, destinationBase: join(alias, "stage") };
  stageAgentPlugins(options);
  const unchanged = () =>
    runtimeDirectoryFiles(value.stage).map((file) => ({
      path: file.path,
      content: readFileSync(file.source, "utf8"),
      modified: statSync(file.source).mtimeMs,
      inode: statSync(file.source).ino,
    }));
  const before = unchanged();
  stageAgentPlugins(options);
  expect(unchanged()).toEqual(before);
  expect(() => value.verify(value.declaration(), "staged")).not.toThrow();
});
