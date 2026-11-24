// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_ANALYTICS_EVENT_NAMES, PRODUCT_ANALYTICS_PROPERTY_KEYS } from "./posthogPrivacy";

const manifest = readFileSync(join(process.cwd(), "docs", "TELEMETRY.md"), "utf8");

describe("telemetry manifest", () => {
  it("documents every analytics event and property the code can send", () => {
    for (const event of PRODUCT_ANALYTICS_EVENT_NAMES) {
      expect(manifest, `docs/TELEMETRY.md is missing event ${event}`).toContain(`\`${event}\``);
    }
    for (const key of PRODUCT_ANALYTICS_PROPERTY_KEYS) {
      expect(manifest, `docs/TELEMETRY.md is missing property ${key}`).toContain(`\`${key}\``);
    }
  });

  it("documents every opt-out switch", () => {
    for (const token of [
      "PORACODE_TELEMETRY_ENABLED=0",
      "DO_NOT_TRACK=1",
      "POSTHOG_ENABLED=0",
      "PORACODE_CRASH_REPORTS_ENABLED=0",
      "SENTRY_DSN=off",
      "Settings → Privacy",
    ]) {
      expect(manifest, `docs/TELEMETRY.md is missing ${token}`).toContain(token);
    }
  });
});
