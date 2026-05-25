import { describe, expect, it } from "vitest";
import { TerminalLinkProvider } from "./TerminalLinkProvider";

type LinkProviderProbe = {
  _getWindowedLineStrings(lineIndex: number): [string[], number];
};

function makeLine(text: string, isWrapped = false) {
  return {
    isWrapped,
    translateToString: () => text,
  };
}

function makeProvider(lines: ReturnType<typeof makeLine>[]): LinkProviderProbe {
  return new TerminalLinkProvider(
    {
      buffer: {
        active: {
          getLine: (index: number) => lines[index],
          getNullCell: () => ({}),
        },
      },
    } as never,
    () => undefined,
  ) as unknown as LinkProviderProbe;
}

describe("TerminalLinkProvider", () => {
  it("does not append numbered instruction lines to URL links", () => {
    const provider = makeProvider([
      makeLine("  https://auth.openai.com/codex/device"),
      makeLine("2. Enter this one-time code"),
    ]);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toBe("  https://auth.openai.com/codex/device");
  });

  it("keeps stitching hard-wrapped URL continuation lines", () => {
    const provider = makeProvider([
      makeLine("https://auth.x.ai/oauth2/authorize?response_type=code&clie"),
      makeLine("nt_id=grok-build&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback"),
    ]);

    const [lines] = provider._getWindowedLineStrings(0);

    expect(lines.join("")).toContain("client_id=grok-build");
    expect(lines.join("")).toContain("redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback");
  });
});
