import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCrashReportConsentGate, createCrashReportConsentReader } from "./crashReportConsent";

const directories: string[] = [];

function settingsFile(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-consent-"));
  directories.push(dir);
  const path = join(dir, "settings.json");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

function writePrivacy(path: string, privacy: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify({ privacy }));
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

describe("crash report consent reader", () => {
  it("fails both streams closed for missing paths, missing files, and hard-off env", () => {
    expect(createCrashReportConsentReader(null, {})()).toEqual({
      crashReports: false,
      nativeCrashDumps: false,
    });
    expect(
      createCrashReportConsentReader(
        join(tmpdir(), `missing-poracode-settings-${crypto.randomUUID()}`),
        {},
      )(),
    ).toEqual({ crashReports: false, nativeCrashDumps: false });
    const path = settingsFile({
      privacy: { crashReports: true, nativeCrashDumps: true, consentDecided: true },
    });
    expect(createCrashReportConsentReader(path, { CI: "true" })()).toEqual({
      crashReports: false,
      nativeCrashDumps: false,
    });
  });

  it("keeps an old crash-report opt-in valid without granting raw dumps", () => {
    const path = settingsFile({
      privacy: { productAnalytics: false, crashReports: true, consentDecided: true },
    });
    expect(createCrashReportConsentReader(path, {})()).toEqual({
      crashReports: true,
      nativeCrashDumps: false,
    });
  });

  it("reads both decisions atomically and follows live revocation", () => {
    const path = settingsFile({
      privacy: { crashReports: true, nativeCrashDumps: true, consentDecided: true },
    });
    const readConsent = createCrashReportConsentReader(path, {});
    expect(readConsent()).toEqual({ crashReports: true, nativeCrashDumps: true });

    writePrivacy(path, {
      crashReports: true,
      nativeCrashDumps: false,
      consentDecided: true,
    });
    expect(readConsent()).toEqual({ crashReports: true, nativeCrashDumps: false });

    writePrivacy(path, {
      crashReports: false,
      nativeCrashDumps: true,
      consentDecided: true,
    });
    expect(readConsent()).toEqual({ crashReports: false, nativeCrashDumps: false });
  });
});
