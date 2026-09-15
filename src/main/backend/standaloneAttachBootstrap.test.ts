// Focused regression for the extracted Electron bootstrap helpers: namespace
// mapping, sync peek side-effect-freedom, deferred outcomes, refusal text,
// ephemeral shell state isolation, and attach-mode database guards.

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEphemeralShellState,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
  resolveDesktopBaseDir,
  shouldDeferLeaseForAttachProbe,
} from "./standaloneAttachBootstrap";

describe("standalone attach bootstrap", () => {
  it("maps the desktop base dir like managed startup", () => {
    expect(
      resolveDesktopBaseDir({
        baseDirOverride: "/tmp/custom-profile",
        isDev: false,
        channel: "stable",
      }),
    ).toBe("/tmp/custom-profile");
    expect(resolveDesktopBaseDir({ isDev: true, channel: "stable" })).toContain(".poracode-dev");
    expect(resolveDesktopBaseDir({ isDev: false, channel: "stable" })).toContain(".poracode");
  });

  it("peeks without side effects on definitive absence", () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-peek-")));
    try {
      const namespace = join(root, "profile");
      expect(shouldDeferLeaseForAttachProbe(namespace)).toBe(false);
      // Peek created no lease, record, or discovery files.
      expect(() => realpathSync.native(join(root, "profile.host-owner.sqlite"))).toThrow(/ENOENT/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no-probe when startup took the synchronous managed path", async () => {
    await expect(decideDeferredStandaloneAttach(null)).resolves.toEqual({ kind: "no-probe" });
  });

  it("returns managed when deferred discovery vanished (owner stopped)", async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-attach-deferred-")));
    try {
      await expect(
        decideDeferredStandaloneAttach({ baseDir: join(root, "profile") }),
      ).resolves.toEqual({ kind: "managed", baseDir: join(root, "profile") });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("describes refusals without leaking secrets", () => {
    const text = describeAttachRefusal({
      kind: "refuse",
      baseDir: "/tmp/profile",
      reason: "incompatible-owner",
      detail: "Existing owner remote protocol is 999; this build requires 12.",
    });
    expect(text).toContain("cannot attach");
    expect(text).toContain("incompatible-owner");
    expect(text).not.toContain("pairing");
    expect(text).not.toContain("token");
  });

  it("keeps ephemeral shell state off the owned root", async () => {
    const state = createEphemeralShellState();
    expect(state.get("window-bounds")).toBeNull();
    state.set("window-bounds", JSON.stringify({ width: 100, height: 100 }));
    expect(JSON.parse(state.get("window-bounds") as string)).toMatchObject({ width: 100 });
    await expect(state.close()).resolves.toBeUndefined();
  });

  it("keeps attach mode off the local backend structurally (no handlers to guard)", async () => {
    const modulePath = join(process.cwd(), "src/main/backend/standaloneAttachBootstrap.ts");
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(modulePath, "utf8");
    expect(source).not.toContain("createAttachModeDatabaseGuard");
    expect(source).not.toContain("throwWhenLocalBackendMissing");
    // Fail-closed is handler absence (attach startup never registers local
    // procedure handlers), not a guard call: nothing here may acquire a lease,
    // fork a backend, or open SQLite.
    for (const forbidden of [
      "HostOwnerLease.acquire",
      "new BackendHostClient",
      "initDatabase(",
      "getSqlite(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
