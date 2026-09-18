import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { expect, it } from "vitest";

const { Terminal } = createRequire(import.meta.url)(
  "@xterm/xterm",
) as typeof import("@xterm/xterm");

it("keeps native terminal widths identical to the renderer's Unicode provider", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../scripts/generate-terminal-unicode-widths.mjs", import.meta.url),
        ),
        "--check",
      ],
      { stdio: "pipe" },
    ),
  ).not.toThrow();
});

it("pins native Unicode projection fixtures to the real web terminal parser", async () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../protocol/remote/v3/fixtures/terminal-unicode-projection.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { cases: Array<{ id: string; input: string; expected: string }> };
  for (const item of fixture.cases) {
    const terminal = new Terminal({ allowProposedApi: true, cols: 80, rows: 24 });
    try {
      terminal.loadAddon(new Unicode11Addon());
      terminal.unicode.activeVersion = "11";
      await new Promise<void>((resolve) => terminal.write(item.input, resolve));
      const lines: string[] = [];
      for (let row = 0; row <= terminal.buffer.active.cursorY; row += 1) {
        lines.push(terminal.buffer.active.getLine(row)!.translateToString(true));
      }
      expect({ id: item.id, text: lines.join("\n") }).toEqual({ id: item.id, text: item.expected });
    } finally {
      terminal.dispose();
    }
  }
});
