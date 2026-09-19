// Desktop startup admission: the deferred attach-vs-managed decision, the
// managed owner admission, legacy-data migration, and the data-root
// preparation. Split out of `desktopAppReady` along its first seam (V5 plan
// 1.4 / H8). This module runs BEFORE any native service or backend process
// starts, exactly like the inline block it replaces.

import { app } from "electron";
import { toError } from "@/shared/errorMessage";
import { preparePoracodeDataRoot } from "./poracodeData";
import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";
import { admitDesktopManagedOwner } from "./backend/desktopOwnerAdmission";
import {
  buildStandaloneAttachInfoForRenderer,
  createStandaloneAttachSession,
  decideDeferredStandaloneAttach,
  describeAttachRefusal,
} from "./backend/standaloneAttachBootstrap";
import { startStandaloneAttachMode } from "./standaloneAttachMode";
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
 * Decide and admit the desktop startup authority.
 *
 * With a deferred probe: run the authenticated attach decision. Attach boots
 * the attach-mode startup and reports `attached` (the caller returns early).
 * A deferred-managed outcome follows the existing managed startup verbatim,
 * still acquiring the lease before mutations (a held lock refuses loudly;
 * only a free lease recovers the same desktop root). Headless-mapping
 * evidence never reaches the managed branch.
 */
export async function admitDesktopStartup(): Promise<DesktopStartupAdmission> {
  if (desktopApp.deferredStandaloneProbe) {
    const outcome = await decideDeferredStandaloneAttach(desktopApp.deferredStandaloneProbe);
    if (outcome.kind === "refuse") throw new Error(describeAttachRefusal(outcome));
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
      desktopApp.poracodePaths = preparePoracodeDataRoot(outcome.baseDir);
    }
  }
  if (desktopApp.desktopOwnerAcquisitionError) throw desktopApp.desktopOwnerAcquisitionError;
  return { kind: "managed" };
}
