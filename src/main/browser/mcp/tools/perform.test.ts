import { describe, expect, it, vi } from "vitest";
import { performPageActions, readPerformSteps, PERFORM_TOOL } from "./perform";
import * as page from "./page";
import { formatToolResult } from "./formatResult";
import { CHROME_TOOLS, normalizeChromeToolName } from "../../external/chromeTools";
import { TOOLS } from "./specs";

vi.mock("./page", async (importOriginal) => ({
  ...(await importOriginal<typeof page>()),
  dispatchPageTool: vi.fn<typeof page.dispatchPageTool>(),
}));

const context = {} as page.PageToolContext;

describe("perform page workflows", () => {
  it.each(["wait", "wait_for_js"])(
    "marks JavaScript-capable %s as potentially destructive on both surfaces",
    (name) => {
      expect(TOOLS.find((tool) => tool.name === name)?.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
      expect(CHROME_TOOLS.find((tool) => tool.name === name)?.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
    },
  );
  it("rejects all actions before executing when a later step is disabled", async () => {
    const dispatch = vi.mocked(page.dispatchPageTool).mockReset();
    await expect(
      performPageActions(
        { steps: [{ action: "fill" }, { action: "click" }] },
        { ...context, disabledTools: ["click"] },
      ),
    ).rejects.toThrow("Tool disabled by Poracode: click");
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("honors snapshot restrictions for implicit observation", async () => {
    const dispatch = vi.mocked(page.dispatchPageTool).mockReset();
    await expect(
      performPageActions(
        { steps: [{ action: "fill" }] },
        { ...context, disabledTools: ["snapshot"] },
      ),
    ).rejects.toThrow("Tool disabled by Poracode: snapshot");
    expect(dispatch).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { steps: [] },
    { steps: Array.from({ length: 21 }, () => ({ action: "click" })) },
    { steps: [null] },
    { steps: [[]] },
    { steps: [{ action: "perform" }] },
    { steps: [{ action: "navigate" }] },
    { steps: [{ action: "fill", tabId: "other" }] },
    { steps: [{ action: "click", observe: "text" }] },
    { steps: [{ action: "click" }], observe: "image" },
  ])("rejects malformed or cross-tab batches before dispatch: %j", (payload) => {
    vi.mocked(page.dispatchPageTool).mockReset();
    expect(() => readPerformSteps(payload)).toThrow(/steps|step|action|observe/);
    expect(page.dispatchPageTool).not.toHaveBeenCalled();
  });

  it("runs ordered actions with one final observation and preserves intermediate results", async () => {
    const dispatch = vi
      .mocked(page.dispatchPageTool)
      .mockReset()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ found: true })
      .mockResolvedValueOnce({ nodes: [{ name: "Saved" }] });
    const steps = [
      { action: "fill", ref: "@e1", text: "Ada" },
      { action: "wait", text: "Saved" },
    ];
    const result = await performPageActions({ steps }, context);
    expect(dispatch.mock.calls.map((call) => call[0])).toEqual(["fill", "wait", "snapshot"]);
    expect(dispatch.mock.calls[0]?.[2]).toMatchObject({ animateCursor: false });
    expect(result).toMatchObject({
      ok: true,
      steps: [{ index: 0 }, { index: 1 }],
      observation: { nodes: [{ name: "Saved" }] },
    });
  });

  it.each([{ found: false }, { ok: false }, { error: "permission denied" }])(
    "stops on returned failure %j",
    async (failure) => {
      const dispatch = vi
        .mocked(page.dispatchPageTool)
        .mockReset()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(failure)
        .mockResolvedValueOnce({ nodes: [] });
      const result = await performPageActions(
        {
          steps: [
            { action: "fill", selector: "#name", text: "Ada" },
            { action: "wait", selector: "#ready" },
            { action: "click", selector: "#submit" },
          ],
        },
        context,
      );
      expect(dispatch.mock.calls.map((call) => call[0])).toEqual(["fill", "wait", "snapshot"]);
      expect(result).toMatchObject({
        ok: false,
        failedIndex: 1,
        steps: [{ index: 0 }, { index: 1, result: failure }],
      });
      expect(formatToolResult("perform", result)).toMatchObject({ isError: true });
      expect(JSON.parse(formatToolResult("perform", result).content[0]!.text!)).toMatchObject({
        failedIndex: 1,
        steps: [{ index: 0 }, { index: 1 }],
      });
    },
  );

  it("preserves completed actions if the next action throws and observation fails", async () => {
    vi.mocked(page.dispatchPageTool)
      .mockReset()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("target detached"))
      .mockRejectedValueOnce(new Error("page closed"));
    expect(
      await performPageActions({ steps: [{ action: "click" }, { action: "fill" }] }, context),
    ).toMatchObject({
      ok: false,
      failedIndex: 1,
      error: "target detached",
      steps: [{ index: 0 }],
      observationError: "page closed",
    });
  });

  it("does not turn observation failure into a claim that actions were rolled back", async () => {
    vi.mocked(page.dispatchPageTool)
      .mockReset()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("page closed"));
    expect(await performPageActions({ steps: [{ action: "click" }] }, context)).toMatchObject({
      ok: false,
      error: expect.stringContaining("do not replay"),
      steps: [{ index: 0 }],
    });
  });

  it("omits observation when requested", async () => {
    const dispatch = vi.mocked(page.dispatchPageTool).mockReset().mockResolvedValue({ ok: true });
    expect(
      await performPageActions({ steps: [{ action: "click" }], observe: "none" }, context),
    ).not.toHaveProperty("observation");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("publishes one canonical shared command schema and retains previous Chrome names", () => {
    for (const name of [...page.PAGE_TOOL_NAMES, "perform"]) {
      const browser = TOOLS.find((tool) => tool.name === name)!;
      const chrome = CHROME_TOOLS.find((tool) => tool.name === name)!;
      const properties = { ...(browser.inputSchema.properties as Record<string, unknown>) };
      delete properties.tabId;
      expect(chrome).toEqual({ ...browser, inputSchema: { ...browser.inputSchema, properties } });
      expect(normalizeChromeToolName(`chrome_${name}`)).toBe(name);
    }
    expect(CHROME_TOOLS.some((tool) => tool.name.startsWith("chrome_"))).toBe(false);
    expect(PERFORM_TOOL.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
