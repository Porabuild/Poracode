import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { friendlyError, msg } from "@/shared/messages";
// Importing the i18n runtime installs the shared-message resolver as a side
// effect (via `./sharedMessages`), so `msg()` becomes locale-aware here.
import { dynamicActivate } from "@/renderer/i18n/i18n";

describe("shared message i18n integration", () => {
  beforeEach(async () => {
    await dynamicActivate("en");
  });

  afterAll(async () => {
    // Restore the source locale for any later test sharing this worker.
    await dynamicActivate("en");
  });

  it("returns the English source when the source locale is active", () => {
    expect(msg("git.commit.failed", { detail: "boom" })).toBe("Commit failed: boom");
    expect(msg("git.worktree.cleanupFailed", { original: "ORIG", cleanup: "CLN" })).toBe(
      "ORIG\nWorktree cleanup also failed: CLN",
    );
  });

  it("returns translated text once a non-source locale is active", async () => {
    await dynamicActivate("es");
    const translated = msg("git.commit.failed", { detail: "boom" });
    // Differs from the English source (so a translation was applied) and still
    // interpolates the `{detail}` value.
    expect(translated).not.toBe("Commit failed: boom");
    expect(translated).toContain("boom");
    expect(msg("update.serviceUnavailable")).toBe(
      "El servicio de actualizaciones no está disponible temporalmente.",
    );
    expect(msg("remote.session.expired")).toBe(
      "El emparejamiento caducó: empareja de nuevo para reconectar.",
    );
  });

  it("preserves a leading placeholder + newline through translation", async () => {
    await dynamicActivate("es");
    const translated = msg("git.worktree.cleanupFailed", { original: "ORIG", cleanup: "CLN" });
    // Both placeholders and the newline survive (regression guard for the PO
    // multiline handling of `{original}\n…`).
    expect(translated.startsWith("ORIG\n")).toBe(true);
    expect(translated).toContain("CLN");
    expect(translated).not.toContain("{original}");
    expect(translated).not.toContain("{cleanup}");
  });

  it("translates pattern-matched friendly errors", async () => {
    await dynamicActivate("es");
    const summary = friendlyError(new Error("CONFLICT (content): Merge conflict in src/x.ts"));
    expect(summary).not.toBe("Merge has conflicts");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("translates wrapped ACP authentication verification errors", async () => {
    await dynamicActivate("es");
    const summary = friendlyError(
      new Error(
        "Error invoking remote method 'poracode:authenticate-acp-agent': Error: My ACP reported authentication success, but Poracode could not verify it. Configure My ACP directly, then try again.",
      ),
    );

    expect(summary).toBe(
      "My ACP informó que la autenticación se realizó correctamente, pero Poracode no pudo verificarla. Configura My ACP directamente y vuelve a intentarlo.",
    );
  });

  it("translates main-process SSH manifest errors and preserves their path", async () => {
    await dynamicActivate("es");
    const path = "C:\\Poracode\\server.ssh-runtime-manifest.json";
    const summary = friendlyError(
      new Error(`Poracode SSH runtime manifest is missing or invalid: ${path}`),
    );

    expect(summary).not.toBe(`Poracode SSH runtime manifest is missing or invalid: ${path}`);
    expect(summary).toContain(path);
  });
});
// @vitest-environment node
