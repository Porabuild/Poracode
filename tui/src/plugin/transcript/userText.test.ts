import { expect, test } from "bun:test";
import { tokenizeUserText } from "./userText";

const rootNames = new Set(["src", "docs"]);

test("plain text passes through as one segment", () => {
  expect(tokenizeUserText("hello world", rootNames)).toEqual([
    { kind: "text", text: "hello world" },
  ]);
});

test("code spans become code segments", () => {
  expect(tokenizeUserText("run `bun test` now", rootNames)).toEqual([
    { kind: "text", text: "run " },
    { kind: "code", text: "bun test" },
    { kind: "text", text: " now" },
  ]);
});

test("project-path code spans become file chips", () => {
  expect(tokenizeUserText("check `src/server.ts:2` now", rootNames)).toEqual([
    { kind: "text", text: "check " },
    {
      kind: "file",
      text: "src/server.ts:2",
      label: "server.ts · L2",
      ref: { kind: "file", path: "src/server.ts", line: 2 },
    },
    { kind: "text", text: " now" },
  ]);
});

test("unclosed backtick stays text", () => {
  expect(tokenizeUserText("a `b c", rootNames)).toEqual([{ kind: "text", text: "a `b c" }]);
});

test("project paths become file chips", () => {
  expect(tokenizeUserText("see src/app.ts:12-20 please", rootNames)).toEqual([
    { kind: "text", text: "see " },
    {
      kind: "file",
      text: "src/app.ts:12-20",
      label: "app.ts · L12-20",
      ref: { kind: "file", path: "src/app.ts", line: 12, endLine: 20 },
    },
    { kind: "text", text: " please" },
  ]);
});

test("folders need root names and consume the trailing slash", () => {
  expect(tokenizeUserText("in src/lib/ now", rootNames)).toEqual([
    { kind: "text", text: "in " },
    { kind: "file", text: "src/lib/", label: "lib/", ref: { kind: "folder", path: "src/lib" } },
    { kind: "text", text: " now" },
  ]);
  expect(tokenizeUserText("in src/lib/ now")).toEqual([{ kind: "text", text: "in src/lib/ now" }]);
});

test("non-path tokens stay text", () => {
  expect(tokenizeUserText("@scope/pkg and/or $10/month", rootNames)).toEqual([
    { kind: "text", text: "@scope/pkg and/or $10/month" },
  ]);
});
