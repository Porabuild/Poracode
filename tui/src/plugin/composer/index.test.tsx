import "../../../opencode/packages/tui/test/preload";
import { expect, spyOn, test } from "bun:test";
import { createMockMouse, createTestRenderer } from "@opentui/core/testing";
import { render } from "@opentui/solid";
import { resolveThemeDocument } from "@opencode/theme/tui";
import { Effect, FileSystem } from "effect";
import { Global } from "@opencode/util/global";
import { NEWS_FEED_URL } from "@/shared/newsFeed";
import { CHANGELOG_URL } from "@/shared/changelog";
import { Plugin } from "@opencode/plugin/tui";
import { getPoracodeTheme, parseTheme } from "../../../opencode/packages/tui/src/theme";
import { tmpdir } from "../../../opencode/packages/tui/test/fixture/fixture";
import {
  createEventStream,
  createFetch,
  directory,
  json,
} from "../../../opencode/packages/tui/test/fixture/tui-client";
import type { Adapter } from "../../adapter";
import { ComposerMetadata, registerComposerUi } from ".";
import { registerDraftUi } from "./draft";
import { registerServerUi } from "../servers";

type HomeDraftMountOptions = {
  width?: number;
  height?: number;
  mode?: "dark" | "light";
  version?: string;
  channel?: string;
  config?: Record<string, unknown>;
  modelName?: string;
  variants?: { id: string }[];
  mcp?: { name: string; status: { status: string } }[];
  adapter: Adapter;
  newsFetch?: (input: URL | RequestInfo) => Promise<Response>;
};

async function mountHomeDraft(options: HomeDraftMountOptions) {
  const state = await tmpdir();
  const output = await createTestRenderer({
    width: options.width ?? 100,
    height: options.height ?? 30,
    kittyKeyboard: true,
  });
  await output.renderer.setupTerminal();
  output.renderer.start();
  const location = { directory, project: { id: "project", directory, canonical: directory } };
  const model = {
    id: "first",
    modelID: "first",
    providerID: "demo",
    name: options.modelName ?? "Demo Model",
    variants: options.variants ?? [],
    cost: [],
    time: { released: 0 },
  };
  const api = createFetch((url) => {
    if (url.pathname === "/api/location") return json(location);
    if (url.pathname === "/api/agent")
      return json({
        location,
        data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }],
      });
    if (url.pathname === "/api/provider")
      return json({ location, data: [{ id: "demo", name: "Demo" }] });
    if (url.pathname === "/api/integration")
      return json({
        location,
        data: [
          {
            id: "demo",
            name: "Demo",
            methods: [],
            connections: [{ type: "env", name: "FIXTURE" }],
          },
        ],
      });
    if (url.pathname === "/api/model") return json({ location, data: [model] });
    if (url.pathname === "/api/model/default") return json({ location, data: model });
    if (options.mcp && url.pathname === "/api/mcp") return json({ location, data: options.mcp });
    return undefined;
  }, createEventStream());
  const { run } = await import("@opencode/tui");
  const defaultFetch = async (input: URL | RequestInfo) => {
    if (input === NEWS_FEED_URL || input === CHANGELOG_URL) return json(undefined);
    throw new Error(`Unexpected fetch: ${String(input)}`);
  };
  const fetch = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(options.newsFetch ?? defaultFetch, {
      preconnect: globalThis.fetch.preconnect,
    }),
  );
  const task = Effect.runPromise(
    run({
      app: {
        name: "poracode",
        version: options.version ?? "test",
        channel: options.channel ?? "test",
      },
      args: {},
      server: { endpoint: { url: "http://test/" }, fetch: api.fetch },
      config: {
        get: async () => ({ animations: false, ...(options.config ?? {}) }),
        update: async () => ({}),
      },
      packages: { prepare: async () => ({ directory: "" }) },
      terminalHandoff: async () => ({
        renderer: output.renderer,
        mode: options.mode ?? "dark",
        complete: () => {},
      }),
      plugins: {
        local: false,
        server: false,
        internal: [
          Plugin.define({
            id: "poracode.composer-test",
            setup(context) {
              registerComposerUi(context, options.adapter);
              registerDraftUi(context, options.adapter);
              registerServerUi(context, options.adapter);
            },
          }),
        ],
      },
      log: () => {},
    }).pipe(
      Effect.provide(Global.layerWith({ state: state.path })),
      Effect.provide(FileSystem.layerNoop({})),
    ),
  );
  return {
    output,
    async dispose() {
      output.renderer.destroy();
      fetch.mockRestore();
      await task;
      await state[Symbol.asyncDispose]();
    },
  };
}

test("draft surface renders rounded controls and opens the real pickers before sending", async () => {
  const project = { id: "project", name: "Example project", directory };
  const approvalOptions = [
    { id: "ask", label: "Ask" },
    { id: "auto", label: "Auto mode" },
  ];
  let approval = approvalOptions[0]!;
  let startPoint: string | undefined;
  const adapter = {
    modelReasoning: async () => ({ values: ["low", "medium", "high"], default: "medium" }),
    draftApprovalState: async () => ({
      current: approval.id,
      label: approval.label,
      options: approvalOptions,
    }),
    setDraftApproval: async (_provider: string, id: string) => {
      approval = approvalOptions.find((entry) => entry.id === id)!;
    },
    draftProject: async () => project,
    draftProjects: async () => [project],
    draftBranches: async () => ({
      current: "main",
      defaultBranch: "origin/main",
      branches: [{ name: "origin/main" }, { name: "origin/feature" }],
    }),
    setDraftWorktree: (_project: string, branch?: string) => {
      startPoint = branch;
    },
    draftWorktreeStartPoint: () => startPoint,
    newsLineSettings: async () => ({ enabled: true, activity: false, disabledProviders: [] }),
    savedServers: () => [],
  } as unknown as Adapter;
  const { output, dispose } = await mountHomeDraft({
    variants: [{ id: "low" }, { id: "medium" }, { id: "high" }],
    adapter,
    newsFetch: async (input) => {
      if (input === NEWS_FEED_URL)
        return json({
          version: 1,
          items: [
            {
              id: "fixture-announcement",
              kind: "announcement",
              text: { en: "Try the new thread controls" },
              action: { type: "url", url: "https://poracode.com/", label: { en: "Read story" } },
            },
          ],
        });
      if (input === CHANGELOG_URL) return json(undefined);
      throw new Error(`Unexpected fetch: ${String(input)}`);
    },
  });
  const frame = (text: string) => output.waitForFrame((screen) => screen.includes(text));
  const close = async (title: string) => {
    output.mockInput.pressEscape();
    await output.waitForFrame((screen) => !screen.includes(title));
  };
  try {
    await frame("Medium ▾");
    await frame("Ask ▾");
    await frame("Example project ▾");
    await frame("Current checkout ▾");
    await frame("Try the new thread controls");
    await frame("Read story ›");
    const initial = output.captureCharFrame();
    expect(initial).toContain("╭");
    expect(initial).toContain("↑");
    expect(initial).not.toContain("┃");
    const lines = initial.split("\n");
    const topBorderRow = lines.findIndex((line) => line.includes("╭"));
    const bottomBorderRow = lines.findIndex((line) => line.includes("╰"));
    const headerLine = lines[topBorderRow - 1] ?? "";
    expect(headerLine).toContain("Example project ▾");
    expect(headerLine).toContain("● Local ▾");
    expect(headerLine).toContain(directory);
    expect(headerLine.indexOf(directory)).toBeGreaterThan(headerLine.indexOf("Local ▾"));
    const composerFooterLine = lines[bottomBorderRow + 1] ?? "";
    expect(composerFooterLine).toContain("Current checkout ▾");
    expect(composerFooterLine).not.toContain("ctrl+p commands");
    expect(composerFooterLine).not.toContain("shift+tab agents");
    expect((lines[bottomBorderRow + 2] ?? "").trim()).toBe("");
    const newsRow = lines.findIndex((line) => line.includes("Try the new thread controls"));
    const homeFooterRow = lines.findIndex((line) => line.includes("ctrl+p commands"));
    expect(newsRow).toBeGreaterThan(bottomBorderRow + 2);
    expect(homeFooterRow).toBeGreaterThan(newsRow);
    const homeFooterLine = lines[homeFooterRow] ?? "";
    expect(homeFooterLine).toContain("shift+tab agents");
    expect(homeFooterLine).toContain("ctrl+p commands");
    expect(homeFooterLine).toContain("test");
    expect(homeFooterLine.indexOf("shift+tab agents")).toBeLessThan(homeFooterLine.indexOf("test"));
    const spans = output.captureSpans();
    const canvasBg = spans.lines[0]?.spans[0]?.bg;
    const borderSpan = spans.lines[topBorderRow]?.spans.find((span) => span.text.includes("╭"));
    expect(borderSpan?.bg.equals(canvasBg!)).toBe(true);
    const sendRow = lines.findIndex((line) => line.includes("↑"));
    const sendSpan = spans.lines[sendRow]?.spans.find((span) => span.text.includes("↑"));
    expect(sendSpan?.bg.equals(canvasBg!)).toBe(true);
    await clickChip(output, "Medium ▾");
    await frame("Reasoning effort");
    expect(output.captureCharFrame()).not.toContain("Default");
    await clickChip(output, "High");
    await frame("High ▾");
    await clickChip(output, "Ask ▾");
    await frame("Approval policy");
    const pickerFrame = output.captureCharFrame();
    expect(pickerFrame).toContain("╭");
    expect(pickerFrame).toContain("╰");
    const pickerLines = pickerFrame.split("\n");
    const pickerTopRow = pickerLines.findIndex((line) => line.includes("╭"));
    const pickerSpans = output.captureSpans();
    const pickerTopSpan = pickerSpans.lines[pickerTopRow]?.spans.find((span) =>
      span.text.includes("╭"),
    );
    expect(pickerTopSpan?.bg.equals(canvasBg!)).toBe(true);
    const activeRow = pickerLines.findIndex((line) => line.includes("Ask"));
    const activeSpan = pickerSpans.lines[activeRow]?.spans.find((span) =>
      span.text.includes("Ask"),
    );
    const darkTheme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
    expect(activeSpan?.bg.equals(darkTheme.text.brand)).toBe(false);
    await clickChip(output, "Auto mode");
    await frame("Auto mode ▾");
    await clickChip(output, "Example project ▾");
    await frame("Project");
    await close("Project");
    await clickChip(output, "Local ▾");
    await frame("Pair a new server");
    await close("Pair a new server");
    await clickChip(output, "Current checkout ▾");
    await frame("New worktree");
    await clickChip(output, "New worktree");
    await frame("origin/main ▾");
    await clickChip(output, "origin/main ▾");
    await frame("origin/feature");
    await clickChip(output, "origin/feature");
    await frame("origin/feature ▾");
    const worktreeLines = output.captureCharFrame().split("\n");
    const worktreeBottom = worktreeLines.findIndex((line) => line.includes("╰"));
    const worktreeFooter = worktreeLines[worktreeBottom + 1] ?? "";
    expect(worktreeFooter).toContain("● Worktree ▾");
    expect(worktreeFooter).toContain("origin/feature ▾");
    expect(worktreeFooter).not.toContain("ctrl+p commands");
    expect((worktreeLines[worktreeBottom + 2] ?? "").trim()).toBe("");
  } finally {
    await dispose();
  }
});

test("narrow home footer preserves MCP status and renders the usage bar cleanly", async () => {
  const project = { id: "project", name: "Example project", directory };
  const adapter = {
    modelReasoning: async () => undefined,
    draftApprovalState: async () => undefined,
    draftProject: async () => project,
    draftProjects: async () => [project],
    draftBranches: async () => undefined,
    draftWorktreeStartPoint: () => undefined,
    newsLineSettings: async () => ({ enabled: true, activity: true, disabledProviders: [] }),
    providerUsage: async () => ({
      snapshots: [
        {
          providerId: "claude",
          status: "ok",
          fetchedAt: Date.now(),
          windows: [{ id: "extra", label: "Extra usage", usedPercent: 100 }],
        },
      ],
    }),
    savedServers: () => [
      {
        id: "s1",
        name: "MacBook",
        endpoint: "https://mac.local",
        addedAt: "2026-01-01",
        signedIn: true,
      },
    ],
  } as unknown as Adapter;
  const { output, dispose } = await mountHomeDraft({
    width: 80,
    version: "2.0.0-nightly.202611261547",
    channel: "nightly",
    mcp: [
      { name: "browser", status: { status: "connected" } },
      { name: "chrome", status: { status: "connected" } },
      { name: "poracode", status: { status: "connected" } },
    ],
    adapter,
  });
  try {
    await output.waitForFrame(
      (screen) => screen.includes("3 MCP /mcps") && screen.includes("100% used"),
    );
    const lines = output.captureCharFrame().split("\n");
    const usageLine = lines.find((line) => line.includes("100% used")) ?? "";
    expect(usageLine).toContain("Claude Extra usage");
    expect(usageLine).toContain("━━━━━━━━");
    expect(usageLine).toContain("Usage ›");
    const footerLine = lines.find((line) => line.includes("3 MCP")) ?? "";
    expect(footerLine).toContain("3 MCP /mcps");
    expect(footerLine).toContain("2.0.0-nightly.202611261547");
    expect(footerLine).toContain("ctrl+p commands");
    expect(footerLine).not.toContain("shift+tab agents");
    expect(footerLine).not.toContain("Server ·");
  } finally {
    await dispose();
  }
});

test("home composer keeps Send inside right border and DraftNews single-row on narrow widths", async () => {
  const project = {
    id: "project",
    name: "Very-long-repository-name-for-narrow-header",
    directory,
  };
  const adapter = {
    modelReasoning: async () => ({ values: ["low", "medium", "high"], default: "medium" }),
    draftApprovalState: async () => ({
      current: "auto",
      label: "Auto mode",
      options: [{ id: "auto", label: "Auto mode" }],
    }),
    draftProject: async () => project,
    draftProjects: async () => [project],
    draftBranches: async () => undefined,
    draftWorktreeStartPoint: () => undefined,
    newsLineSettings: async () => ({ enabled: true, activity: false, disabledProviders: [] }),
    savedServers: () => [],
  } as unknown as Adapter;
  const { output, dispose } = await mountHomeDraft({
    width: 56,
    modelName: "Claude Opus 4.6 (1M extended context)",
    variants: [{ id: "low" }, { id: "medium" }, { id: "high" }],
    adapter,
    newsFetch: async (input) => {
      if (input === NEWS_FEED_URL)
        return json({
          version: 1,
          items: [
            {
              id: "long-announcement",
              kind: "announcement",
              text: {
                en: "Very long announcement headline that should stay truncated on a single terminal row without wrapping",
              },
              action: { type: "url", url: "https://poracode.com/", label: { en: "Read story" } },
            },
          ],
        });
      if (input === CHANGELOG_URL) return json(undefined);
      throw new Error(`Unexpected fetch: ${String(input)}`);
    },
  });
  try {
    await output.waitForFrame(
      (screen) => screen.includes("Send ↑") && screen.includes("Read story ›"),
    );
    const lines = output.captureCharFrame().split("\n");
    const metaLine = lines.find((line) => line.includes("Send ↑")) ?? "";
    expect(metaLine).toMatch(/Send ↑\s*│\s*$/u);
    const newsIndex = lines.findIndex((line) => line.includes("Read story ›"));
    expect(lines[newsIndex]).toContain("▪");
    expect(lines[newsIndex - 1]?.trim()).toBe("");
    expect((lines[newsIndex + 1] ?? "").trim()).toBe("");
  } finally {
    await dispose();
  }
});

test("light-mode command palette active row keeps visible contrast over opencode2 and poracode themes", async () => {
  for (const themeName of ["poracode", "opencode2"] as const) {
    const project = { id: "project", name: "Example project", directory };
    const adapter = {
      modelReasoning: async () => undefined,
      draftApprovalState: async () => undefined,
      draftProject: async () => project,
      draftProjects: async () => [project],
      draftBranches: async () => undefined,
      draftWorktreeStartPoint: () => undefined,
      newsLineSettings: async () => ({ enabled: false, activity: false, disabledProviders: [] }),
      savedServers: () => [],
    } as unknown as Adapter;
    const { output, dispose } = await mountHomeDraft({
      width: 90,
      mode: "light",
      config: { theme: { name: themeName } },
      adapter,
    });
    try {
      await output.waitForFrame((screen) => screen.includes("ctrl+p commands"));
      await clickChip(output, "ctrl+p commands");
      await output.waitForFrame((screen) => screen.includes("Commands"));
      const charLines = output.captureCharFrame().split("\n");
      const activeIdx = charLines.findIndex(
        (line) => line.includes("›") && line.includes("Switch"),
      );
      expect(activeIdx).toBeGreaterThan(-1);
      const spanLines = output.captureSpans().lines;
      const surfaceSpan = spanLines[activeIdx]?.spans.find((span) => span.text.includes("│"));
      const activeSpan = spanLines[activeIdx]?.spans.find((span) => span.text.includes("Switch"));
      expect(surfaceSpan).toBeDefined();
      expect(activeSpan).toBeDefined();
      expect(activeSpan!.bg.equals(surfaceSpan!.bg)).toBe(false);
    } finally {
      await dispose();
    }
  }
});

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
    expect(frame).toContain("↑");
    expect(frame).not.toContain("feature-x");
    expect(frame).not.toContain("Build ·");
  } finally {
    output.renderer.destroy();
  }
});

test("clicking the composer action button submits when ready and stops when running empty", async () => {
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const adapter = {
    composerState: async () => chipState(),
    gitChanges: async () => undefined,
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

  let submits = 0;
  let interrupts = 0;
  const sendOutput = await createTestRenderer({ width: 100, height: 10 });
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
          canSubmit: true,
          running: false,
          submit: () => {
            submits += 1;
          },
          interrupt: () => {
            interrupts += 1;
          },
        }}
      />
    ),
    sendOutput.renderer,
  );
  try {
    sendOutput.renderer.start();
    await sendOutput.waitForFrame((frame) => frame.includes("Send ↑"));
    const sendSpans = sendOutput.captureSpans().lines.flatMap((line) => line.spans);
    const sendLabelSpan = sendSpans.find((span) => span.text.includes("Send"));
    const arrowSpan = sendSpans.find((span) => span.text.includes("↑"));
    expect(sendLabelSpan?.bg.a).toBe(0);
    expect(arrowSpan?.bg.a).toBe(0);
    expect(arrowSpan?.fg.equals(theme.text.brand)).toBe(true);
    await clickChip(sendOutput, "Send ↑");
    expect(submits).toBe(1);
    expect(interrupts).toBe(0);
  } finally {
    sendOutput.renderer.destroy();
  }

  const stopOutput = await createTestRenderer({ width: 100, height: 10 });
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
          canSubmit: false,
          running: true,
          submit: () => {
            submits += 1;
          },
          interrupt: () => {
            interrupts += 1;
          },
        }}
      />
    ),
    stopOutput.renderer,
  );
  try {
    stopOutput.renderer.start();
    await stopOutput.waitForFrame((frame) => frame.includes("Stop ■"));
    await clickChip(stopOutput, "Stop ■");
    expect(submits).toBe(1);
    expect(interrupts).toBe(1);
  } finally {
    stopOutput.renderer.destroy();
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
  const frame = await output.waitForFrame((screen) => screen.includes(label));
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
      return req.options[1]?.value;
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
