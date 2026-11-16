import { expect, test } from "bun:test";
import { composerChips, type ComposerState } from "./model";

const base = {
  mode: "normal" as const,
  agent: "Build",
  auto: false,
  model: "claude-opus-4-8",
  provider: "Claude Code",
  sessionID: "ses_1",
  variants: [] as readonly string[],
  state: undefined as ComposerState | undefined,
  changes: undefined,
};

test("shell mode shows only the Shell label", () => {
  expect(composerChips({ ...base, mode: "shell", agent: undefined })).toEqual([{ kind: "shell" }]);
});

test("an unloaded agent catalog renders nothing", () => {
  expect(composerChips({ ...base, agent: undefined })).toEqual([]);
});

test("the model chip always leads in normal mode", () => {
  expect(composerChips(base)[0]).toEqual({
    kind: "model",
    model: "claude-opus-4-8",
    provider: "Claude Code",
  });
});

test("options label joins effort, context, and workflows like the desktop", () => {
  const chips = composerChips({
    ...base,
    variants: ["low", "high"],
    variant: "high",
    state: {
      thinking: { on: true },
      workflows: { on: true, label: "Workflows" },
      context: {
        current: "200k",
        label: "200K",
        options: [
          { id: "200k", label: "200K" },
          { id: "1m", label: "1M" },
        ],
      },
    },
  });
  const options = chips.find((chip) => chip.kind === "options");
  expect(options).toMatchObject({ label: "High · 200K · Workflows", variants: true });
});

test("options falls back to Thinking then Options", () => {
  const thinking = composerChips({ ...base, state: { thinking: { on: false } } });
  expect(thinking.find((chip) => chip.kind === "options")).toMatchObject({
    label: "Thinking",
    variants: false,
  });
  const bare = composerChips({
    ...base,
    variants: ["a", "b"],
    state: { thinking: { on: true } },
  });
  expect(bare.find((chip) => chip.kind === "options")).toMatchObject({ label: "Thinking" });
});

test("options is hidden when nothing offers a choice", () => {
  const chips = composerChips({ ...base, state: { fast: { on: false } } });
  expect(chips.some((chip) => chip.kind === "options")).toBe(false);
  expect(chips.some((chip) => chip.kind === "fast")).toBe(true);
});

test("approval and changes chips require a session", () => {
  const state: ComposerState = {
    approval: {
      current: "auto",
      label: "Auto",
      options: [{ id: "auto", label: "Auto" }],
    },
  };
  const changes = { insertions: 3, deletions: 1 };
  expect(
    composerChips({ ...base, sessionID: undefined, state, changes }).map((chip) => chip.kind),
  ).toEqual(["model"]);
  expect(composerChips({ ...base, state, changes }).map((chip) => chip.kind)).toEqual([
    "model",
    "approval",
    "changes",
  ]);
});

test("plan chip only for the Plan agent; auto chip when auto-accept is on", () => {
  const kinds = composerChips({ ...base, agent: "Plan", auto: true }).map((chip) => chip.kind);
  expect(kinds).toEqual(["model", "plan", "auto"]);
});

test("a clean checkout with no worktree shows no changes chip", () => {
  const kinds = composerChips({
    ...base,
    changes: { insertions: 0, deletions: 0 },
  }).map((chip) => chip.kind);
  expect(kinds).toEqual(["model"]);
  const worktree = composerChips({
    ...base,
    changes: { insertions: 0, deletions: 0, worktree: "feature-x" },
  }).map((chip) => chip.kind);
  expect(worktree).toEqual(["model", "changes"]);
});
