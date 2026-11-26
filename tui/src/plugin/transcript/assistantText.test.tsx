import "../../../opencode/packages/tui/test/preload";
import { expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { createTestRenderer } from "@opentui/core/testing";
import { render } from "@opentui/solid";
import { SyntaxStyle } from "@opentui/core";
import { resolveThemeDocument } from "@opencode/theme/tui";
import { getPoracodeTheme, parseTheme } from "../../../opencode/packages/tui/src/theme";
import type { Plugin } from "@opencode/plugin/tui";
import { AssistantText, revealStreamedText } from "./assistantText";

test("assistant text reveals appended chunks, then flushes immediately on completion", async () => {
  const output = await createTestRenderer({ width: 100, height: 8 });
  const [text, setText] = createSignal("Already visible. ");
  const [streaming, setStreaming] = createSignal(true);
  await render(() => {
    const shown = revealStreamedText(text, streaming);
    return <text>{shown()}</text>;
  }, output.renderer);
  try {
    output.renderer.start();
    await output.waitForFrame((frame) => frame.includes("Already visible."));
    const full = `Already visible. Streaming this chunk over multiple frames.`;
    setText(full);
    await output.waitForFrame(
      (frame) => frame.includes("Already visible. Str") && !frame.includes(full),
    );
    setStreaming(false);
    await output.waitForFrame((frame) => frame.includes(full));
  } finally {
    output.renderer.destroy();
  }
});

async function mountAssistant(streaming: boolean) {
  const output = await createTestRenderer({ width: 60, height: 16 });
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const context = {
    theme,
    themeMode: "dark",
    ui: { animationsEnabled: () => false },
    renderer: output.renderer,
    syntax: SyntaxStyle.fromStyles(
      { default: { fg: "#ffffff" }, "markup.raw": { fg: "#888888" } },
      output.renderer.nativeScene,
    ),
    client: { file: { list: async () => ({ data: [] }) } },
  } as unknown as Plugin.Context;
  await render(
    () => (
      <AssistantText
        context={context}
        markdown={{ mode: "rendered", renderNode: undefined }}
        text={
          "Intro `src/app.ts:12` see https://github.com/anomalyco/opencode/pull/1234.\n\n```ts\nconst x = 1\n```\n\nOutro."
        }
        streaming={streaming}
        root={"/repo"}
        rootNames={new Set(["src"])}
      />
    ),
    output.renderer,
  );
  output.renderer.start();
  await output.waitForFrame(
    (frame) =>
      frame.includes("const x = 1") &&
      frame.includes("Intro") &&
      frame.includes("app.ts") &&
      frame.includes("#1234"),
  );
  return { output, theme };
}

function lines(output: Awaited<ReturnType<typeof mountAssistant>>["output"]) {
  const frame = output.captureSpans();
  const dump = frame.lines.map((line) => line.spans.map((span) => span.text).join(""));
  const codeLine = frame.lines.find((line) =>
    line.spans.some((span) => span.text.includes("const x = 1")),
  );
  const proseLine = frame.lines.find((line) =>
    line.spans.some((span) => span.text.includes("Intro")),
  );
  if (!codeLine) throw new Error(`codeLine missing\n${dump.join("\n")}`);
  if (!proseLine) throw new Error(`proseLine missing\n${dump.join("\n")}`);
  return { codeLine, proseLine, dump };
}

test("fenced code rows paint the raised panel; prose rows do not", async () => {
  const { output, theme } = await mountAssistant(false);
  try {
    const chip = theme.background.raised.base;
    const { codeLine, proseLine, dump } = lines(output);
    const codeBg = codeLine.spans.find((span) => span.text.includes("const"))?.bg;
    const proseBg = proseLine.spans.find((span) => span.text.includes("Intro"))?.bg;
    if (codeBg?.toString() !== chip.toString())
      throw new Error(`code bg ${codeBg} != chip ${chip}\n${dump.join("\n")}`);
    if (proseBg?.toString() === chip.toString())
      throw new Error(`prose bg is chip\n${dump.join("\n")}`);
    const bgs = codeLine.spans.map((span) => span.bg?.toString());
    expect(bgs.includes(chip.toString())).toBe(true);
    const proseBgs = proseLine.spans.map((span) => span.bg?.toString());
    expect(proseBgs.includes(chip.toString())).toBe(false);
    // Inline code and link chips paint border.base — the user-bubble pill.
    const chipBg = theme.border.base;
    const spans = output.captureSpans().lines.flatMap((line) => line.spans);
    const codeChip = spans.find((span) => span.text.includes("app.ts · L12"));
    const linkChip = spans.find((span) => span.text.includes("#1234"));
    if (codeChip?.bg?.toString() !== chipBg.toString())
      throw new Error(`code chip bg ${codeChip?.bg} != ${chipBg}\n${dump.join("\n")}`);
    if (linkChip?.bg?.toString() !== chipBg.toString())
      throw new Error(`link chip bg ${linkChip?.bg} != ${chipBg}\n${dump.join("\n")}`);
  } finally {
    output.renderer.destroy();
  }
});

test("streaming code rows keep in-place rendering without the panel", async () => {
  const { output, theme } = await mountAssistant(true);
  try {
    const chip = theme.background.raised.base;
    const { codeLine, dump } = lines(output);
    const bgs = codeLine.spans.map((span) => span.bg?.toString());
    if (bgs.includes(chip.toString()))
      throw new Error(`streaming code row has panel bg\n${dump.join("\n")}`);
  } finally {
    output.renderer.destroy();
  }
});

test("revealStreamedText does not slice from the end on a leading low surrogate", async () => {
  const output = await createTestRenderer({ width: 60, height: 6 });
  const [text, setText] = createSignal("");
  const emitted: string[] = [];
  await render(() => {
    const shown = revealStreamedText(text, () => true, "");
    return (
      <text>
        {(() => {
          const value = shown();
          emitted.push(value);
          return value;
        })()}
      </text>
    );
  }, output.renderer);
  try {
    output.renderer.start();
    setText("\uDC00abcdefghijklmnop");
    await output.waitForFrame((frame) => frame.includes("abcdefghijklmnop"));
    expect(
      emitted.some(
        (value) =>
          value.includes("o") &&
          !value.includes("p") &&
          value.length >= 15 &&
          emitted.indexOf(value) <= 1,
      ),
    ).toBe(false);
    for (let i = 1; i < emitted.length; i++)
      expect(emitted[i]!.length).toBeGreaterThanOrEqual(emitted[i - 1]!.length);
  } finally {
    output.renderer.destroy();
  }
});

test("AssistantText animates a revealKey once and renders immediately on remount", async () => {
  const full = "Smooth streaming across multiple frames for a new assistant part.";
  const first = await createTestRenderer({ width: 80, height: 8 });
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const context = {
    theme,
    themeMode: "dark",
    ui: { animationsEnabled: () => true },
    renderer: first.renderer,
    syntax: SyntaxStyle.fromStyles(
      { default: { fg: "#ffffff" }, "markup.raw": { fg: "#888888" } },
      first.renderer.nativeScene,
    ),
    client: { file: { list: async () => ({ data: [] }) } },
  } as unknown as Plugin.Context;
  const [streaming, setStreaming] = createSignal(true);
  await render(
    () => (
      <AssistantText
        context={context}
        markdown={{ mode: "rendered", renderNode: undefined }}
        text={full}
        streaming={streaming()}
        revealKey="part-reveal-once"
        root="/repo"
        rootNames={new Set(["src"])}
      />
    ),
    first.renderer,
  );
  try {
    first.renderer.start();
    await first.waitForFrame((frame) => frame.includes("Smooth") && !frame.includes(full));
    setStreaming(false);
    await first.waitForFrame((frame) => frame.includes(full));
  } finally {
    first.renderer.destroy();
  }

  const second = await createTestRenderer({ width: 80, height: 8 });
  const secondContext = {
    ...context,
    renderer: second.renderer,
    syntax: SyntaxStyle.fromStyles(
      { default: { fg: "#ffffff" }, "markup.raw": { fg: "#888888" } },
      second.renderer.nativeScene,
    ),
  } as unknown as Plugin.Context;
  await render(
    () => (
      <AssistantText
        context={secondContext}
        markdown={{ mode: "rendered", renderNode: undefined }}
        text={full}
        streaming={true}
        revealKey="part-reveal-once"
        root="/repo"
        rootNames={new Set(["src"])}
      />
    ),
    second.renderer,
  );
  try {
    await second.renderOnce();
    expect(second.captureCharFrame()).toContain(full);
  } finally {
    second.renderer.destroy();
  }
});
