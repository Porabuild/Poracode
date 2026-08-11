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

  it("parses SolidStart seroval hydration (key:$R[n]={...})", () => {
    // Live console shape from opencode.ai / CodexBar fixtures.
    const body =
      `$R[24]($R[18],$R[27]={mine:!0,useBalance:!1,` +
      `rollingUsage:$R[28]={status:"ok",resetInSec:10620,usagePercent:100},` +
      `weeklyUsage:$R[29]={status:"ok",resetInSec:523600,usagePercent:79},` +
      `monthlyUsage:$R[30]={status:"ok",resetInSec:1990800,usagePercent:89}});`;
    const windows = parseOpenCodeGoWindows(body, NOW);
    expect(windows.find((w) => w.id === "session-5h")).toMatchObject({
      usedPercent: 100,
      resetsAt: NOW + 10620 * 1000,
    });
    expect(windows.find((w) => w.id === "weekly")?.usedPercent).toBe(79);
    expect(windows.find((w) => w.id === "monthly")?.usedPercent).toBe(89);
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
