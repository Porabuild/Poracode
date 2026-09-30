import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  assertWindowsPortableMembers,
  listStagedMembers,
  longestMemberPath,
  windowsMemberProblems,
} from "./server-tarball-members.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

void test("portable members pass", () => {
  assert.deepEqual(
    windowsMemberProblems("native-overlay/node-pty/win32-x64/conpty/OpenConsole.exe"),
    [],
  );
  assert.deepEqual(windowsMemberProblems("lib/console.cjs"), [], "console.cjs is not CON");
  assert.deepEqual(windowsMemberProblems("resources/skills/a-b_c.d/SKILL.md"), []);
});

void test("forbidden characters, trailing dot/space and reserved names are reported", () => {
  for (const bad of ["a<b", "a>b", "a:b", 'a"b', "a|b", "a?b", "a*b", "a\u0001b"]) {
    assert.ok(windowsMemberProblems(`dir/${bad}`).length > 0, JSON.stringify(bad));
  }
  assert.match(windowsMemberProblems("dir/name.")[0], /ends with a dot or space/u);
  assert.match(windowsMemberProblems("dir/name ")[0], /ends with a dot or space/u);
  for (const reserved of ["CON", "prn.txt", "Aux", "NUL.md", "COM1", "com9.log", "LPT5"]) {
    assert.ok(
      windowsMemberProblems(`x/${reserved}`).some((problem) =>
        /reserved device name/u.test(problem),
      ),
      reserved,
    );
  }
  assert.deepEqual(windowsMemberProblems("x/COM0"), []);
  assert.ok(windowsMemberProblems("CON/file").length > 0, "a reserved directory segment counts");
});

void test("case-insensitive duplicates are rejected with every offender named", () => {
  assert.throws(
    () => assertWindowsPortableMembers("/unused", ["lib/A.js", "lib/a.js", "b/NUL", "ok"]),
    (error) =>
      /lib\/a\.js: differs from lib\/A\.js only by case/u.test(error.message) &&
      /b\/NUL: uses a reserved device name/u.test(error.message),
  );
  assert.deepEqual(assertWindowsPortableMembers("/unused", ["lib/a.js", "lib/b.js"]), [
    "lib/a.js",
    "lib/b.js",
  ]);
});

void test("assertWindowsPortableMembers walks a real stage tree", () => {
  const stage = mkdtempSync(join(tmpdir(), "poracode-members-"));
  tempDirs.push(stage);
  mkdirSync(join(stage, "lib"), { recursive: true });
  writeFileSync(join(stage, "lib", "server.cjs"), "");
  writeFileSync(join(stage, "package.json"), "{}");
  assert.deepEqual(listStagedMembers(stage), ["lib", "lib/server.cjs", "package.json"]);
  assert.doesNotThrow(() => assertWindowsPortableMembers(stage));
  writeFileSync(join(stage, "lib", "aux.txt"), "");
  assert.throws(() => assertWindowsPortableMembers(stage), /lib\/aux\.txt/u);
});

void test("longestMemberPath reports the deepest member", () => {
  assert.equal(longestMemberPath(["a", "a/b/c.js", "a/b.js"]), "a/b/c.js");
  assert.equal(longestMemberPath([]), "");
});
