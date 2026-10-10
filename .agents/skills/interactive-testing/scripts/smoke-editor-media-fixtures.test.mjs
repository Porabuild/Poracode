import assert from "node:assert/strict";
import test from "node:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  ownFixtureFiles,
  png,
  validateFixture,
  wav,
  webm,
} from "./smoke-editor-media-fixtures.mjs";

const scratch = resolve("tmp/v2-editor-media-20261010");

async function fixture(t) {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "fixtures-unit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectDir = join(root, "project");
  const outDir = join(root, "artifacts");
  await mkdir(join(projectDir, ".git"), { recursive: true });
  await mkdir(outDir);
  await writeFile(join(projectDir, "README.md"), "# Poracode smoke fixture\n");
  await writeFile(join(projectDir, "hello.txt"), "untouched fixture data\n");
  await writeFile(
    join(root, "session.json"),
    JSON.stringify({
      schemaVersion: 2,
      mode: "mock",
      state: "ready",
      root,
      projectDir,
      outDir,
      token: "editor-media-fixtures-unit-token",
    }),
  );
  return {
    projectDir,
    outDir,
    fixture: { project: { id: "smoke-project", location: { kind: "posix", path: projectDir } } },
  };
}

async function assertFilesRestored(owned) {
  assert.deepEqual((await readdir(owned.projectDir)).sort(), [".git", "README.md", "hello.txt"]);
  assert.equal(
    await readFile(join(owned.projectDir, "hello.txt"), "utf8"),
    "untouched fixture data\n",
  );
}

void test("extracted fixture helpers require validation and fence reload paths", async (t) => {
  const owned = await fixture(t);
  await assert.rejects(
    ownFixtureFiles({ projectDir: owned.projectDir }),
    /validated mock session/u,
  );
  const validated = await validateFixture(owned.fixture, owned.outDir);
  const files = await ownFixtureFiles(validated);
  try {
    const initial = await files.write("picture.png", png(24, 16, [32, 112, 208]));
    const path = join(owned.projectDir, files.relative("picture.png"));
    const before = await lstat(path);
    const changed = await files.write("picture.png", png(32, 20, [208, 48, 32]));
    const after = await lstat(path);
    assert.equal(after.ino, before.ino);
    assert(after.mtimeMs > before.mtimeMs);
    assert.notEqual(changed.sha256, initial.sha256);
    await assert.rejects(
      files.write("../hello.txt", "must not write"),
      /invalid owned media filename/u,
    );
    await assert.rejects(files.write("tone.wav", Buffer.alloc(512_001)), /byte bound/u);
  } finally {
    await files.cleanup();
  }
  await assertFilesRestored(owned);
});

void test("fixture cleanup removes owned files but preserves an unrelated file", async (t) => {
  const owned = await fixture(t);
  const files = await ownFixtureFiles(await validateFixture(owned.fixture, owned.outDir));
  await files.write("tone.wav", wav(2));
  const directory = join(owned.projectDir, files.relative("tone.wav"), "..");
  await writeFile(join(directory, "unrelated.txt"), "keep this file");
  await assert.rejects(files.cleanup(), /cleanup failed/u);
  assert.deepEqual(await readdir(directory), ["unrelated.txt"]);
  assert.equal(await readFile(join(directory, "unrelated.txt"), "utf8"), "keep this file");
  await unlink(join(directory, "unrelated.txt"));
  await files.cleanup();
  await assertFilesRestored(owned);
});

void test("substituted file is neither overwritten nor deleted, and other owned files still clean up", async (t) => {
  const owned = await fixture(t);
  const files = await ownFixtureFiles(await validateFixture(owned.fixture, owned.outDir));
  await files.write("picture.png", png(24, 16, [32, 112, 208]));
  await files.write("tone.wav", wav(2));
  const path = join(owned.projectDir, files.relative("picture.png"));
  await unlink(path);
  await symlink(join(owned.projectDir, "hello.txt"), path);
  await assert.rejects(files.write("picture.png", "must not overwrite"));
  await assert.rejects(files.cleanup(), /cleanup failed/u);
  assert((await lstat(path)).isSymbolicLink());
  assert.deepEqual(await readdir(join(path, "..")), ["picture.png"]);
  assert.equal(
    await readFile(join(owned.projectDir, "hello.txt"), "utf8"),
    "untouched fixture data\n",
  );
});

void test("synthetic format constructors reject unbounded durations/dimensions and invalid codec frames", () => {
  assert.throws(() => png(129, 1, [0, 0, 0]), /dimensions/u);
  assert.throws(() => png(1, 1, [256, 0, 0]), /color/u);
  assert.throws(() => wav(Infinity), /duration/u);
  assert.throws(() => webm("", 5), /duration/u);
  assert.throws(() => webm(Buffer.from("not WebP").toString("base64"), 2), /encode WebP/u);
});
