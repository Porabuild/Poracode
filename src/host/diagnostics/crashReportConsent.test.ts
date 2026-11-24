import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCrashReportConsentGate } from "./crashReportConsent";

function settingsFile(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-consent-"));
  const path = join(dir, "settings.json");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe("crash report consent gate", () => {
  it("fails closed for missing paths and pre-consent settings files", () => {
    expect(createCrashReportConsentGate(null, {})()).toBe(false);
    expect(createCrashReportConsentGate(settingsFile({ themeMode: "dark" }), {})()).toBe(false);
  });

  it("follows the stored opt-in and live file changes", () => {
    const path = settingsFile({
      privacy: { productAnalytics: false, crashReports: true, consentDecided: true },
    });
    const gate = createCrashReportConsentGate(path, {});
    expect(gate()).toBe(true);

    writeFileSync(
      path,
      JSON.stringify({
        privacy: { productAnalytics: true, crashReports: false, consentDecided: true },
      }),
    );
    expect(gate()).toBe(false);
  });

  it("lets environment switches win over a stored opt-in", () => {
    const path = settingsFile({
      privacy: { productAnalytics: true, crashReports: true, consentDecided: true },
    });
    expect(createCrashReportConsentGate(path, { DO_NOT_TRACK: "1" })()).toBe(false);
    expect(createCrashReportConsentGate(path, { PORACODE_TELEMETRY_ENABLED: "0" })()).toBe(false);
    expect(createCrashReportConsentGate(path, { PORACODE_CRASH_REPORTS_ENABLED: "0" })()).toBe(
      false,
    );
  });
});
