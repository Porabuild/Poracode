import { describe, expect, it } from "vitest";
import { deriveCommandIntent } from "./interpret";
import { deriveCommandActionsIntent } from "./actions";
import { formatCommandIntent } from "./format";
import type { CommandTitleLabels } from "./model";

describe("shared command meaning", () => {
  it("preserves the source file and line range of a wrapped read", () => {
    expect(deriveCommandIntent(`/bin/zsh -lc "sed -n '2,9p' src/東京.ts"`)).toEqual({
      kind: "view",
      title: { kind: "view", text: "src/東京.ts", lines: "2-9" },
      path: { path: "src/東京.ts" },
    });
  });

  it("retains Windows file identity separately from its basename", () => {
    expect(
      deriveCommandIntent("pwsh -Command 'Get-Content -LiteralPath C:\\work\\src\\App.tsx'"),
    ).toEqual({
      kind: "view",
      title: { kind: "view", text: "App.tsx" },
      path: { path: "C:\\work\\src\\App.tsx", filePath: true },
    });
  });

  it("keeps the first batched read's semicolon out of its path", () => {
    const intent = deriveCommandIntent("sed -n '1,5p' a.ts; sed -n '6,10p' a.ts");
    expect(intent.path?.path).toBe("a.ts");
    expect(intent.title).toEqual({ kind: "view", text: "a.ts", lines: "1-5" });
  });

  it("retains search arguments without embedding an English sentence", () => {
    expect(deriveCommandIntent(`rg -n -e 'view state' -e 'active' /work/project/src`)).toEqual({
      kind: "search",
      title: { kind: "search", query: "view state", scope: "src", additionalPatterns: 1 },
    });
  });

  it.each([
    ["npm run lint", "check", "check", "npm run lint"],
    ["pnpm exec oxfmt src/a.ts", "command", "format-files", undefined],
    ["git status --short", "git", "git", "git status --short"],
    ["yarn add typescript", "install", "install-packages", "yarn add"],
    ["npm config get registry", "package", "package-config", "npm config get"],
    ["echo ready", "command", "run", "echo ready"],
  ])("classifies %s with a stable label token", (command, kind, label, text) => {
    const result = deriveCommandIntent(command as string);
    expect(result.kind).toBe(kind);
    expect(result.title).toEqual({ kind: "label", label, ...(text === undefined ? {} : { text }) });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("retains canonical classified actions and rejects partial unknown lists", () => {
    const actions = [
      { kind: "read", path: "/work/a.ts" },
      { kind: "search", query: "state", path: "/work/src" },
    ];
    const before = structuredClone(actions);
    expect(deriveCommandActionsIntent(actions)).toEqual({
      kind: "search",
      title: { kind: "view", text: "a.ts" },
      additionalActions: 1,
    });
    expect(actions).toEqual(before);
    expect(deriveCommandActionsIntent([...actions, { kind: "future" }])).toBeNull();
  });

  it("does not invent a path for a multiple-file read action", () => {
    expect(
      deriveCommandActionsIntent([
        { kind: "read", path: "a.ts" },
        { kind: "read", path: "b.ts" },
      ]),
    ).toEqual({
      kind: "view",
      title: { kind: "view", text: "a.ts, b.ts" },
    });
  });

  it("localizes one meaning without parsing or changing it", () => {
    const meaning = deriveCommandIntent("sed -n '2,9p' src/app.ts");
    const before = structuredClone(meaning);
    const labels: CommandTitleLabels = {
      label: (key) => (key === "view" ? "Voir" : key === "search" ? "Chercher" : key),
      searchIn: (query, scope) => `Chercher «${query}» dans ${scope}`,
    };
    expect(formatCommandIntent(meaning, labels)).toEqual({
      title: "Voir 2:9: src/app.ts",
      kind: "view",
      parts: { prefix: "Voir 2:9: ", path: "src/app.ts" },
    });
    expect(formatCommandIntent(deriveCommandIntent("rg state src"), labels).title).toBe(
      "Chercher «state» dans src",
    );
    expect(meaning).toEqual(before);
  });
});
