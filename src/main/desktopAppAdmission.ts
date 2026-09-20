// Desktop startup admission: the deferred attach-vs-managed decision, the
// managed owner admission, legacy-data migration, and the data-root
// preparation. Split out of `desktopAppReady` along its first seam (V5 plan
// 1.4 / H8). This module runs BEFORE any native service or backend process
// starts, exactly like the inline block it replaces.

import { app, safeStorage } from "electron";
import { toError } from "@/shared/errorMessage";
import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";
import { admitDesktopManagedOwner } from "./backend/desktopOwnerAdmission";
import {
  buildStandaloneAttachInfoForRenderer,
  createStandaloneAttachSession,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
} from "./backend/standaloneAttachBootstrap";
import { startStandaloneAttachMode } from "./standaloneAttachMode";
import { safeStorageHealth } from "./safeStorageHealth";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  ensureDesktopOwnedRoot,
  type DesktopOsSealedKeyCodec,
} from "@/backend/ownership/promoteDesktopRoot";
import { openDesktopPromotionProgress } from "./desktopPromotionProgress";
import {
  channel,
  desktopApp,
  legacyBaseDirOverride,
  legacyElectronUserDataDir,
} from "./desktopAppState";

export type DesktopStartupAdmission =
  /** Attach mode started; managed startup must not run. */
  | { readonly kind: "attached" }
  /** Managed startup continues with the prepared paths. */
  | { readonly kind: "managed" };

/**
 * The desktop's native key codec for the automatic data-root promotion: the
 * stored `secret-key.safe` blob is unsealed in-process, so the promoted
 * root's credential state can record the real key fingerprint. Present only
 * when the OS-backed secret storage probed healthy this launch — otherwise
 * the promotion records session-only custody, matching the shell's own
 * degraded behavior.
 */
function desktopOsSealedKeyCodec(): DesktopOsSealedKeyCodec | undefined {
  if (safeStorageHealth(process.platform).kind !== "healthy") return undefined;
  return {
    unseal: async (sealed) => safeStorage.decryptString(Buffer.from(sealed, "base64")),
  };
}

/**
 * Decide and admit the desktop startup authority.
 *
 * With a deferred probe: run the authenticated attach decision. Attach boots
 * the attach-mode startup and reports `attached` (the caller returns early).
 * A deferred-managed outcome follows the existing managed startup verbatim,
 * still acquiring the lease before mutations (a held lock refuses loudly;
 * only a free lease recovers the same desktop root). Headless-mapping
 * evidence never reaches the managed branch.
 *
 * Both managed routes converge on the unified data root (V5 plan 1.3): the
 * synchronous route already holds the lease taken before the ready event in
 * `main.ts`; the deferred route admits the owner here. Either way the plain
 * desktop root is promoted into (or resumed into) the owned `.host-v1`
 * sibling under that lease before any path is published, and the manual
 * `activate` command stays the explicit override for staged imports.
 */
export async function admitDesktopStartup(): Promise<DesktopStartupAdmission> {
  if (desktopApp.deferredStandaloneProbe) {
    let outcome = await decideDeferredStandaloneAttach(desktopApp.deferredStandaloneProbe);
    if (outcome.kind === "refuse") {
      // Unified data root (V5 plan 1.3): a hard-killed previous MANAGED
      // launch leaves its host-control.json behind, and the authenticated
      // describe then fails at the connection level. There is exactly one
      // data root now, so the lease can arbitrate recovery — the same
      // acquire-and-reprobe path a busy root always took — and a genuinely
      // live owner still fails the acquire loudly. Every other refusal
      // (compat gate, mismatched root, stale generation, …) stays a refusal.
      const recordedOwner = readHostOwnerRecord(resolveDesktopHostRootPaths(outcome.baseDir));
      if (outcome.reason === "unreachable-owner" && recordedOwner?.kind === "desktop") {
        console.warn(
          "[poracode] stale desktop owner discovery for this profile; " +
            "recovering through the lease:",
          outcome.detail,
        );
        outcome = { kind: "managed", baseDir: outcome.baseDir };
      } else {
        throw new Error(describeAttachRefusal(outcome));
      }
    }
    if (outcome.kind === "attach") {
      desktopApp.standaloneAttachInfo = await buildStandaloneAttachInfoForRenderer({
        endpoint: outcome.endpoint,
        ownerGeneration: outcome.ownerGeneration,
        profileNamespace: outcome.profileNamespace,
        dataRoot: outcome.dataRoot,
        controlPaths: outcome.controlPaths,
        // Host-declared service capabilities from the minting describe (V5
        // plan 1.2); the renderer derives availability from this payload.
        capabilities: outcome.description.capabilities,
      });
      // Re-verification anchor for the whole attach session: every
      // renderer (re)bootstrap re-runs the authenticated describe with a
      // generation check before the payload is served again.
      desktopApp.standaloneAttachSession = createStandaloneAttachSession({
        controlPaths: outcome.controlPaths,
        mode: outcome.description.mode,
        info: desktopApp.standaloneAttachInfo,
      });
      await startStandaloneAttachMode();
      return { kind: "attached" };
    }
    if (outcome.kind === "no-probe") {
      throw new Error("Standalone attach probe did not run.");
    }
    const electronUserDataDir = app.getPath("userData");
    try {
      // Full managed admission: legacy-owner refusal, lease with bounded
      // wait-and-reprobe, then the data-custody fence probe. A genuinely
      // held root still fails loudly; a concurrently quitting owner wins.
      desktopApp.desktopOwnerLease = await admitDesktopManagedOwner({
        baseDir: outcome.baseDir,
        channel,
        electronUserDataDir,
        ...(legacyElectronUserDataDir ? { legacyElectronUserDataDir } : {}),
        ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
        allowCustomDataRoot: app.isPackaged,
      });
    } catch (error) {
      desktopApp.desktopOwnerAcquisitionError = toError(error);
      console.error("[poracode] failed to acquire the desktop host owner:", error);
    }
    if (!desktopApp.desktopOwnerAcquisitionError) {
      try {
        const result = migrateLegacyDataOutOfProcess({
          baseDir: outcome.baseDir,
          channel,
          electronUserDataDir,
          legacyElectronUserDataDir,
          ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
          allowCustomDataRoot: app.isPackaged,
        });
        if (result.status === "migrated") {
          console.info(`[migrate] imported all available Lightcode data into ${outcome.baseDir}`);
        }
      } catch (error) {
        console.warn(`[migrate] failed to import Lightcode data into ${outcome.baseDir}:`, error);
      }
    }
  }
  if (!desktopApp.desktopOwnerAcquisitionError) {
    // Unified data root (V5 plan 1.3): promote the plain desktop root into
    // the owned `.host-v1` sibling (or resume an interrupted promotion)
    // under the held lease, then publish the prepared paths. On the
    // deferred route the promotion runs after the legacy import, so
    // Lightcode data lands in the promoted root like any other data.
    const lease = desktopApp.desktopOwnerLease;
    if (lease === null) throw new Error("The desktop host owner lease was not acquired.");
    const osSealedKey = desktopOsSealedKeyCodec();
    let promotionProgress: ReturnType<typeof openDesktopPromotionProgress> | undefined;
    try {
      desktopApp.poracodePaths = await ensureDesktopOwnedRoot(lease, {
        ...(osSealedKey === undefined ? {} : { osSealedKey }),
        onSizePreflight: (bytes) => {
          promotionProgress = openDesktopPromotionProgress(bytes);
        },
        onCopyProgress: (copied, total) => promotionProgress?.update(copied, total),
      });
    } finally {
      promotionProgress?.close();
    }
  }
  if (desktopApp.desktopOwnerAcquisitionError) throw desktopApp.desktopOwnerAcquisitionError;
  return { kind: "managed" };
}
