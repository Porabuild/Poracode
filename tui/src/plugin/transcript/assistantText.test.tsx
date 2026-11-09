import "../../../opencode/packages/tui/test/preload";
import { expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { render } from "@opentui/solid";
import { SyntaxStyle } from "@opentui/core";
import { resolveThemeDocument } from "@opencode/theme/tui";
import { getPoracodeTheme, parseTheme } from "../../../opencode/packages/tui/src/theme";
import type { Plugin } from "@opencode/plugin/tui";
import { AssistantText } from "./assistantText";

async function mountAssistant(streaming: boolean) {
  const output = await createTestRenderer({ width: 60, height: 16 });
  const theme = resolveThemeDocument(parseTheme(getPoracodeTheme()), "dark");
  const context = {
    theme,
    themeMode: "dark",
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
