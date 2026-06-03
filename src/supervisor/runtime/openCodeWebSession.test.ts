import { describe, expect, it } from "vitest";
import { parseOpenCodeGoWindows } from "./openCodeWebSession";

const NOW = 1_700_000_000_000;

/**
 * opencode.ai SSR's `lite.subscription.get` into the page as
 * `rollingUsage`/`weeklyUsage`/`monthlyUsage`, each `{ usagePercent, resetInSec }`.
 */
describe("parseOpenCodeGoWindows", () => {
  it("parses rolling/weekly/monthly windows with reset times", () => {
    const body =
      `{rollingUsage:{usagePercent:42,resetInSec:3600},` +
      `weeklyUsage:{usagePercent:10,resetInSec:86400},` +
      `monthlyUsage:{usagePercent:5,resetInSec:200000}}`;
    const windows = parseOpenCodeGoWindows(body, NOW);
    expect(windows.map((w) => w.id)).toEqual(["session-5h", "weekly", "monthly"]);
    expect(windows.find((w) => w.id === "session-5h")).toMatchObject({
      usedPercent: 42,
      resetsAt: NOW + 3600 * 1000,
    });
    expect(windows.find((w) => w.id === "weekly")?.usedPercent).toBe(10);
  });

  it("clamps usagePercent to 0-100 and omits resetsAt when absent", () => {
    const body = `{rollingUsage:{usagePercent:150},weeklyUsage:{usagePercent:0}}`;
    const windows = parseOpenCodeGoWindows(body, NOW);
    expect(windows.find((w) => w.id === "session-5h")?.usedPercent).toBe(100);
    expect(windows.find((w) => w.id === "session-5h")?.resetsAt).toBeUndefined();
  });

  it("returns [] when the two core windows are not both present (no Lite subscription)", () => {
    expect(parseOpenCodeGoWindows(`{monthlyUsage:{usagePercent:5,resetInSec:1}}`, NOW)).toEqual([]);
    expect(parseOpenCodeGoWindows(`<html>signed in, no subscription</html>`, NOW)).toEqual([]);
  });
});
