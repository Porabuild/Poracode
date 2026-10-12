import { expect, it } from "vitest";
import { CommandCompletionParser } from "./commandCompletion";

const marker = "\u001B]777;poracode-shell-complete=unique-token:";

it("waits for the complete marker, exit code, and terminator across chunks", () => {
  const parser = new CommandCompletionParser(marker);
  for (const character of marker) expect(parser.push(character)).toBeNull();
  expect(parser.push("1")).toBeNull();
  expect(parser.push("27")).toBeNull();
  expect(parser.push("\u0007")).toBe(127);
  expect(parser.push("later output")).toBeNull();
});

it("accepts a signed Windows exit code with a split ST terminator", () => {
  const parser = new CommandCompletionParser(marker);
  expect(parser.push(marker + "-1073741510\u001B")).toBeNull();
  expect(parser.push("\\")).toBe(-1073741510);
});

it("finds a completion before a large trailing output chunk without truncating first", () => {
  const parser = new CommandCompletionParser(marker);
  expect(parser.push(marker + "0\u0007" + "output".repeat(50_000))).toBe(0);
});

it("ignores another token and a shell command's escaped marker text", () => {
  const parser = new CommandCompletionParser(marker);
  expect(parser.push("\u001B]777;poracode-shell-complete=another-token:0\u0007")).toBeNull();
  expect(parser.push("printf '\\033]777;poracode-shell-complete=unique-token:0\\007'")).toBeNull();
});

it("replaces prior carry with a baseline and can finish its marker from live output", () => {
  const parser = new CommandCompletionParser(marker);
  expect(parser.push(marker + "9")).toBeNull();
  expect(parser.replace("new baseline " + marker + "1")).toBeNull();
  expect(parser.push("2\u0007")).toBe(12);
});

it("drops incomplete markers on reset", () => {
  const parser = new CommandCompletionParser(marker);
  expect(parser.push(marker + "1")).toBeNull();
  parser.reset();
  expect(parser.push("2\u0007")).toBeNull();
});
