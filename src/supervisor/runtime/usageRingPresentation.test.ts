import { describe, expect, it } from "vitest";
import type { UsageSnapshot, UsageWindow } from "@poracode/agents-usage/types";
import { providerUsageResponse } from "./usageRingPresentation";

const window = (id: string, usedPercent: number): UsageWindow => ({ id, label: id, usedPercent });
const snapshot = (
  providerId: string,
  windows: UsageWindow[],
  status: UsageSnapshot["status"] = "ok",
): UsageSnapshot => ({ providerId, windows, status, fetchedAt: 1 });

describe("owning-host quota-ring presentation", () => {
  it("retains exact registered fast/slow windows and complete profile keys", () => {
    const response = providerUsageResponse(
      [
        snapshot("cursor:work", [window("cursor-auto", 20), window("cursor-api", 90)]),
        snapshot("claude", [window("session-5h", 20), window("weekly-fable", 95)]),
      ],
      true,
      {},
    );
    expect(response.ringLayouts).toEqual({
      "cursor:work": { outerWindowId: "cursor-auto", innerWindowId: "cursor-api" },
      claude: { outerWindowId: "session-5h", innerWindowId: "weekly-fable" },
    });
  });

  it("does not invent another row or discard zero/retained reported windows", () => {
    const response = providerUsageResponse(
      [snapshot("cursor", [window("weekly", 0), window("cursor-api", 80)], "error")],
      false,
      {},
    );
    expect(response.ringLayouts).toEqual({
      cursor: { outerWindowId: "weekly", innerWindowId: "cursor-api" },
    });
    expect(Object.keys(response.ringLayouts ?? {})).toEqual(["cursor"]);
  });

  it("promotes an available inner-only window using the shared selector", () => {
    expect(
      providerUsageResponse([snapshot("claude", [window("weekly-sonnet", 95)])], false, {})
        .ringLayouts,
    ).toEqual({ claude: { outerWindowId: "weekly-sonnet" } });
  });
});
