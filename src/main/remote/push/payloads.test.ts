import { describe, expect, it } from "vitest";
import {
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  assertIOSPushPayload,
  buildAlertPayload,
  buildLiveActivityPayload,
  type IOSLocalizedAlertContent,
} from "./payloads";

const localized = (
  locKey: IOSLocalizedAlertContent["loc-key"] = IOS_ALERT_BODY_LOC_KEYS.finished,
): IOSLocalizedAlertContent => ({
  "title-loc-key": IOS_ALERT_TITLE_LOC_KEY,
  "loc-key": locKey,
});

describe("localized iOS APNs alert contract", () => {
  it("emits only the closed Apple localization dictionary", () => {
    expect(buildAlertPayload(localized())).toEqual({
      aps: {
        alert: {
          "title-loc-key": "push.alert.title",
          "loc-key": "push.alert.finished",
        },
        sound: "default",
      },
    });
  });

  it.each([
    { title: "sk-live-secret /Users/alice/.ssh/id_rsa", body: "Finished" },
    { "title-loc-key": IOS_ALERT_TITLE_LOC_KEY, "loc-key": "push.alert.unknown" },
    { ...localized(), "loc-args": ["secret-token"] },
    { ...localized(), title: "A conversation" },
  ])("refuses literal, unknown, argument-bearing, or extra alert content", (alert) => {
    expect(() => buildAlertPayload(alert as unknown as IOSLocalizedAlertContent)).toThrow(
      /Invalid iOS APNs localized alert/,
    );
  });

  it("refuses invalid alerts on ActivityKit start, update, and end", () => {
    for (const event of ["start", "update", "end"] as const) {
      const input = {
        event,
        contentState: { runningCount: 0, threads: [] },
        now: 1_000_000,
        ...(event === "start"
          ? { attributes: { desktopId: "desktop", desktopName: "Poracode" } }
          : {}),
        alert: { "title-loc-key": IOS_ALERT_TITLE_LOC_KEY, "loc-key": "hostile" },
      };
      expect(() =>
        buildLiveActivityPayload(input as Parameters<typeof buildLiveActivityPayload>[0]),
      ).toThrow(/Invalid iOS APNs localized alert/);
    }
  });

  it("accepts guarded alerts on ActivityKit start, update, and end", () => {
    for (const event of ["start", "update", "end"] as const) {
      const payload = buildLiveActivityPayload({
        event,
        contentState: { runningCount: 0, threads: [] },
        now: 1_000_000,
        ...(event === "start"
          ? { attributes: { desktopId: "desktop", desktopName: "Poracode" } }
          : {}),
        alert: localized(IOS_ALERT_BODY_LOC_KEYS.needsApproval),
      } as Parameters<typeof buildLiveActivityPayload>[0]);
      expect(payload.aps.alert).toEqual(localized(IOS_ALERT_BODY_LOC_KEYS.needsApproval));
      expect(() => assertIOSPushPayload(payload, "liveactivity")).not.toThrow();
    }
  });

  it("requires localized alerts on ordinary pushes and ActivityKit starts", () => {
    expect(() => assertIOSPushPayload({ aps: { alert: "Finished" } }, "alert")).toThrow(
      /Invalid iOS APNs localized alert/,
    );
    expect(() =>
      assertIOSPushPayload(
        { aps: { event: "start", alert: { title: "x", body: "y" } } },
        "liveactivity",
      ),
    ).toThrow(/Invalid iOS APNs localized alert/);
    expect(() => assertIOSPushPayload({ aps: { event: "start" } }, "liveactivity")).toThrow(
      /Invalid iOS APNs localized alert/,
    );
  });
});
