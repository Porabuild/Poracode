import { describe, expect, it } from "vitest";
import type { ThreadStatus } from "@/shared/contracts";
import {
  GENERIC_ALERT_TITLE,
  IOS_ALERT_BODY_LOC_KEYS,
  IOS_ALERT_TITLE_LOC_KEY,
  assertIOSLocalizedAlert,
} from "./payloads";
import {
  alertBody,
  androidStatusFor,
  iosAlertContent,
  pushAlertTitle,
  webAlertContent,
} from "./pushAlertContent";

describe("pushAlertContent", () => {
  describe("iosAlertContent", () => {
    it("is always generic (fail-closed aps.alert contract)", () => {
      const statuses: ThreadStatus[] = [
        "working",
        "needs_approval",
        "needs_reply",
        "finished",
        "error",
        "idle",
      ];
      for (const status of statuses) {
        const alert = iosAlertContent(status);
        expect(alert["title-loc-key"]).toBe(IOS_ALERT_TITLE_LOC_KEY);
        expect(() => assertIOSLocalizedAlert(alert)).not.toThrow();
      }
    });

    it("maps statuses to the fixed body set", () => {
      expect(iosAlertContent("finished")["loc-key"]).toBe(IOS_ALERT_BODY_LOC_KEYS.finished);
      expect(iosAlertContent("error")["loc-key"]).toBe(IOS_ALERT_BODY_LOC_KEYS.error);
      expect(iosAlertContent("needs_approval")["loc-key"]).toBe(
        IOS_ALERT_BODY_LOC_KEYS.needsApproval,
      );
      expect(iosAlertContent("needs_reply")["loc-key"]).toBe(IOS_ALERT_BODY_LOC_KEYS.needsInput);
      expect(iosAlertContent("working")["loc-key"]).toBe(IOS_ALERT_BODY_LOC_KEYS.updated);
    });
  });

  describe("alertBody", () => {
    it("falls back to Updated for non-terminal statuses", () => {
      expect(alertBody("working")).toBe("Updated");
      expect(alertBody("idle")).toBe("Updated");
    });
  });

  describe("pushAlertTitle", () => {
    it("redacts to the generic title when redaction is on", () => {
      expect(pushAlertTitle("Release check", true)).toBe(GENERIC_ALERT_TITLE);
    });

    it("uses the thread title when redaction is off", () => {
      expect(pushAlertTitle("Release check", false)).toBe("Release check");
    });

    it("falls back to the generic title for empty thread titles", () => {
      expect(pushAlertTitle("", false)).toBe(GENERIC_ALERT_TITLE);
    });
  });

  describe("webAlertContent", () => {
    it("carries the thread title unless redacted", () => {
      expect(webAlertContent("Release check", "finished", false)).toEqual({
        title: "Release check",
        body: "Finished",
      });
      expect(webAlertContent("Release check", "finished", true)).toEqual({
        title: GENERIC_ALERT_TITLE,
        body: "Finished",
      });
    });
  });

  describe("androidStatusFor", () => {
    it("debounces working with a silent low-priority card", () => {
      expect(androidStatusFor("working")).toEqual({
        body: "Running",
        priority: 5,
        immediate: false,
        silent: true,
      });
    });

    it("sends attention and terminal statuses immediately at priority 10", () => {
      expect(androidStatusFor("needs_approval")).toEqual({
        body: "Needs your input",
        priority: 10,
        immediate: true,
      });
      expect(androidStatusFor("needs_reply")).toEqual({
        body: "Needs your input",
        priority: 10,
        immediate: true,
      });
      expect(androidStatusFor("finished")).toEqual({
        body: "Finished",
        priority: 10,
        immediate: true,
      });
      expect(androidStatusFor("error")).toEqual({
        body: "Ended with an error",
        priority: 10,
        immediate: true,
      });
    });

    it("returns null for inactive statuses", () => {
      expect(androidStatusFor("idle")).toBeNull();
      expect(androidStatusFor("inactive")).toBeNull();
      expect(androidStatusFor("launching")).toBeNull();
    });
  });
});
