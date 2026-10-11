import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSharedSettings } from "@/shared/settings";

/**
 * Unit coverage for the shared-settings admission helper. Every test loads a
 * fresh module instance because the admission state is module-private.
 */

type AuthorityModule = typeof import("./sharedSettingsAuthority");

async function loadFreshAuthority(): Promise<AuthorityModule> {
  vi.resetModules();
  return await import("./sharedSettingsAuthority");
}

function wholeSnapshot(overrides: Partial<typeof defaultSharedSettings> = {}) {
  return { ...defaultSharedSettings, ...overrides };
}

describe("sharedSettingsAuthority", () => {
  let authority: AuthorityModule;

  beforeEach(async () => {
    authority = await loadFreshAuthority();
  });

  describe("whole-snapshot detection", () => {
    it("accepts a payload delivering an own defined value for every key", () => {
      expect(authority.isWholeSharedSettingsSnapshot(wholeSnapshot())).toBe(true);
    });

    it("rejects a payload missing a key", () => {
      const partial = wholeSnapshot();
      delete (partial as Record<string, unknown>).themeMode;
      expect(authority.isWholeSharedSettingsSnapshot(partial)).toBe(false);
    });

    it("rejects an explicitly undefined value", () => {
      // The hostile payload (a key present but carrying no value) is exactly
      // what the own+defined check exists for, so it is constructed past the
      // type's optional-property discipline on purpose.
      const payload = { ...wholeSnapshot(), themeMode: undefined } as unknown as Partial<
        typeof defaultSharedSettings
      >;
      expect(authority.isWholeSharedSettingsSnapshot(payload)).toBe(false);
    });

    it("rejects inherited properties", () => {
      const inherited = Object.create(wholeSnapshot()) as Partial<typeof defaultSharedSettings>;
      expect(authority.isWholeSharedSettingsSnapshot(inherited)).toBe(false);
    });
  });

  describe("push admission", () => {
    it("admits nothing before any grant", () => {
      expect(authority.settingsWritesAdmitted()).toBe(false);
    });

    it("keeps a partial push non-authoritative when the write path is the whole document", async () => {
      authority.noteExternalPush({ themeMode: "light" }, false);
      expect(authority.settingsWritesAdmitted()).toBe(false);
      // A bounded write path arriving later still admits the bounded flavor.
      authority.noteExternalPush({ themeMode: "dark" }, true);
      expect(authority.settingsWritesAdmitted()).toBe(true);
    });

    it("grants bounded admission to a partial push on a bounded write path", async () => {
      let admitted = false;
      const notified = authority.whenWritesAdmitted().promise.then(() => {
        admitted = true;
      });
      expect(admitted).toBe(false);
      authority.noteExternalPush({ themeMode: "light" }, true);
      await notified;
      expect(admitted).toBe(true);
    });

    it("grants whole authority to a whole push regardless of the write path", () => {
      authority.noteExternalPush(wholeSnapshot({ themeMode: "light" }), false);
      expect(authority.settingsWritesAdmitted()).toBe(true);
    });

    it("grants and resolves waiters for the no-bridge local surface", async () => {
      let admitted = false;
      const notified = authority.whenWritesAdmitted().promise.then(() => {
        admitted = true;
      });
      authority.admitLocalSettingsWrites();
      await notified;
      expect(admitted).toBe(true);
    });

    it("resolves whenWritesAdmitted immediately once admitted", async () => {
      authority.noteExternalPush(wholeSnapshot(), true);
      await expect(authority.whenWritesAdmitted().promise).resolves.toBeUndefined();
    });
  });

  describe("admission wait cancellation", () => {
    it("lets a losing waiter unsubscribe so a later grant does not resolve it", async () => {
      const losing = authority.whenWritesAdmitted();
      losing.unsubscribe();
      let losingResolved = false;
      void losing.promise.then(() => {
        losingResolved = true;
      });

      const kept = authority.whenWritesAdmitted();
      authority.noteExternalPush(wholeSnapshot({ themeMode: "light" }), false);
      await expect(kept.promise).resolves.toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(losingResolved).toBe(false);
    });

    it("keeps unsubscribe idempotent and inert once the wait resolved", async () => {
      authority.noteExternalPush(wholeSnapshot(), false);
      const settled = authority.whenWritesAdmitted();
      await expect(settled.promise).resolves.toBeUndefined();
      expect(() => settled.unsubscribe()).not.toThrow();
      settled.unsubscribe();
    });
  });

  describe("initial-read reconciliation", () => {
    it("returns no reconciliation when no push landed during the read", async () => {
      const readEpoch = authority.beginInitialRead();
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: false,
      });
    });

    it("returns the newest pushed fields for a read a push superseded", async () => {
      const readEpoch = authority.beginInitialRead();
      authority.noteExternalPush({ themeMode: "light" }, false);
      authority.noteExternalPush({ themeMode: "dark", scrollSpeed: 3 }, false);
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: false,
        pushedFields: { themeMode: "dark", scrollSpeed: 3 },
      });
      // Consumed: a second settlement reconciles nothing.
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: false,
      });
    });

    it("retires the read once a whole owner push granted complete authority mid-flight", async () => {
      const readEpoch = authority.beginInitialRead();
      authority.noteExternalPush(wholeSnapshot({ themeMode: "light" }), false);
      expect(authority.settingsWritesAdmitted()).toBe(true);
      // Whole authority makes the read's snapshot obsolete by construction —
      // it can be older than the push and than any local edit accepted since.
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: true,
      });
      // Whole authority holds for the module's lifetime, so the read stays
      // retired on any re-settlement and its overlay is dropped with it.
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: true,
      });
    });

    it("still reconciles over the read when only bounded write admission was granted", async () => {
      const readEpoch = authority.beginInitialRead();
      // Bounded mirror admission is a different guarantee from whole
      // authority: the read remains the only complete base, so its snapshot
      // must still be published with the pushed fields reconciled over it.
      authority.noteExternalPush({ themeMode: "light" }, true);
      expect(authority.settingsWritesAdmitted()).toBe(true);
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: false,
        pushedFields: { themeMode: "light" },
      });
    });

    it("does not track explicitly undefined pushed values", async () => {
      const readEpoch = authority.beginInitialRead();
      const payload = { themeMode: undefined } as unknown as Partial<typeof defaultSharedSettings>;
      authority.noteExternalPush(payload, false);
      expect(authority.takeInitialReadReconciliation(readEpoch)).toEqual({
        supersededByWholeAuthority: false,
      });
    });

    it("grants whole authority and clears a preserved refusal on read admission", async () => {
      const readEpoch = authority.beginInitialRead();
      expect(authority.noteInitialReadFailure(new Error("earlier"), readEpoch)).toBe(true);
      expect(authority.preservedReadRefusal()).toMatchObject({ refused: true });
      expect(authority.settingsWritesAdmitted()).toBe(false);

      authority.admitInitialRead();
      expect(authority.settingsWritesAdmitted()).toBe(true);
      expect(authority.preservedReadRefusal()).toMatchObject({ refused: false });
    });
  });

  describe("initial-read failure", () => {
    it("records the refusal for the current epoch", () => {
      const readEpoch = authority.beginInitialRead();
      const refusal = new Error("Settings document could not be read");
      expect(authority.noteInitialReadFailure(refusal, readEpoch)).toBe(true);
      expect(authority.preservedReadRefusal()).toEqual({ refused: true, error: refusal });
      expect(authority.settingsWritesAdmitted()).toBe(false);
    });

    it("records nothing when a newer push superseded the read", () => {
      const readEpoch = authority.beginInitialRead();
      authority.noteExternalPush(wholeSnapshot({ themeMode: "light" }), false);
      const refusal = new Error("Late settings read failure");
      expect(authority.noteInitialReadFailure(refusal, readEpoch)).toBe(false);
      expect(authority.preservedReadRefusal()).toMatchObject({ refused: false });
    });

    it("a whole push retires an earlier preserved refusal", () => {
      const readEpoch = authority.beginInitialRead();
      authority.noteInitialReadFailure(new Error("refused"), readEpoch);
      authority.noteExternalPush(wholeSnapshot({ themeMode: "light" }), false);
      expect(authority.preservedReadRefusal()).toMatchObject({ refused: false });
      expect(authority.settingsWritesAdmitted()).toBe(true);
    });
  });
});
