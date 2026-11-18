import "../../../opencode/packages/tui/test/preload";
import { expect, test } from "bun:test";
import { createMockMouse, createTestRenderer } from "@opentui/core/testing";
import { render } from "@opentui/solid";
import { resolveThemeDocument } from "@opencode/theme/tui";
import { getPoracodeTheme, parseTheme } from "../../../opencode/packages/tui/src/theme";
import type { Plugin } from "@opencode/plugin/tui";
import type { Adapter } from "../../adapter";
import { ComposerMetadata } from ".";

test("the chip row shows model, approval, and git changes — not the host metadata", async () => {
  const output = await createTestRenderer({ width: 100, height: 10 });
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const adapter = {
    composerState: async () => ({
      approval: {
        current: "auto",
        label: "Auto",
        options: [
          { id: "auto", label: "Auto" },
          { id: "ask", label: "Ask" },
        ],
      },
      fast: { on: false },
    }),
    gitChanges: async () => ({ insertions: 3, deletions: 2, worktree: "feature-x" }),
    setSessionOptions: async () => ({ ok: true as const }),
  } as unknown as Adapter;
  const context = {
    theme,
    themeMode: "dark",
    ui: {
      model: {
        current: () => ({ providerID: "anthropic", modelID: "claude-opus-4-8" }),
        variant: { list: () => [] },
      },
      dialog: { alert: async () => {}, select: async () => undefined },
    },
    keymap: { dispatch: () => {} },
    data: { session: { status: () => "idle" } },
  } as unknown as Plugin.Context;
  await render(
    () => (
      <ComposerMetadata
        context={context}
        adapter={adapter}
        input={{
          sessionID: "ses_test",
          mode: "normal",
          agent: "Build",
          auto: false,
          model: "claude-opus-4-8",
          provider: "anthropic",
          muted: false,
          width: 100,
        }}
      />
    ),
    output.renderer,
  );
  try {
    output.renderer.start();
    await output.waitForFrame(
      (frame) => frame.includes("+3 -2") && frame.includes("claude-opus-4-8"),
    );
    const frame = output.captureCharFrame();
    expect(frame).toContain("claude-opus-4-8");
    expect(frame).toContain("anthropic");
    expect(frame).toContain("Auto");
    expect(frame).toContain("+3 -2");
    expect(frame).toContain("⎇");
    expect(frame).not.toContain("feature-x");
    expect(frame).not.toContain("Build ·");
  } finally {
    output.renderer.destroy();
  }
});

const chipState = () => ({
  approval: {
    current: "auto",
    label: "Auto",
    options: [
      { id: "auto", label: "Auto" },
      { id: "ask", label: "Ask" },
    ],
  },
  fast: { on: false },
});

async function mountChips(
  adapter: Adapter,
  dialog: {
    alert: (req: { title: string; message: string }) => Promise<void>;
    select: <T>(req: {
      title: string;
      options: { title: string; value: T }[];
    }) => Promise<T | undefined>;
  },
) {
  const output = await createTestRenderer({ width: 100, height: 10 });
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const context = {
    theme,
    themeMode: "dark",
    ui: {
      model: {
        current: () => ({ providerID: "anthropic", modelID: "claude-opus-4-8" }),
        variant: { list: () => [] },
      },
      dialog,
    },
    keymap: { dispatch: () => {} },
    data: { session: { status: () => "idle" } },
  } as unknown as Plugin.Context;
  await render(
    () => (
      <ComposerMetadata
        context={context}
        adapter={adapter}
        input={{
          sessionID: "ses_test",
          mode: "normal",
          agent: "Build",
          auto: false,
          model: "claude-opus-4-8",
          provider: "anthropic",
          muted: false,
          width: 100,
        }}
      />
    ),
    output.renderer,
  );
  output.renderer.start();
  await output.waitForFrame((frame) => frame.includes("Fast") && frame.includes("Auto"));
  return output;
}

const clickChip = async (output: Awaited<ReturnType<typeof mountChips>>, label: string) => {
  const frame = output.captureCharFrame();
  const lines = frame.split("\n");
  const y = lines.findIndex((line) => line.includes(label));
  const x = lines[y]!.indexOf(label);
  await createMockMouse(output.renderer).click(x, y);
};

const settle = async (predicate: () => boolean) => {
  for (let i = 0; i < 50 && !predicate(); i++) await Bun.sleep(10);
  expect(predicate()).toBe(true);
};

test("clicking the Fast chip sets fast and refetches composer state", async () => {
  let composerCalls = 0;
  const optionCalls: unknown[] = [];
  const adapter = {
    composerState: async () => {
      composerCalls += 1;
      return chipState();
    },
    gitChanges: async () => undefined,
    setSessionOptions: async (_session: string, options: unknown) => {
      optionCalls.push(options);
      return { ok: true as const };
    },
  } as unknown as Adapter;
  const output = await mountChips(adapter, {
    alert: async () => {},
    select: async () => undefined,
  });
  try {
    expect(composerCalls).toBe(1);
    await clickChip(output, "Fast");
    await settle(() => optionCalls.length === 1 && composerCalls === 2);
    expect(optionCalls[0]).toEqual({ fast: true });
  } finally {
    output.renderer.destroy();
  }
});

test("clicking the approval chip selects a policy and sets it", async () => {
  const optionCalls: unknown[] = [];
  const titles: string[] = [];
  const adapter = {
    composerState: async () => chipState(),
    gitChanges: async () => undefined,
    setSessionOptions: async (_session: string, options: unknown) => {
      optionCalls.push(options);
      return { ok: true as const };
    },
  } as unknown as Adapter;
  const output = await mountChips(adapter, {
    alert: async () => {},
    select: async <T,>(req: { title: string; options: { title: string; value: T }[] }) => {
      titles.push(req.title);
      return "ask" as T;
    },
  });
  try {
    await clickChip(output, "Auto");
    await settle(() => optionCalls.length === 1);
    expect(titles).toEqual(["Approval policy"]);
    expect(optionCalls[0]).toEqual({ approvalPolicy: "ask" });
  } finally {
    output.renderer.destroy();
  }
});
