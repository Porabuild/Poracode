import { dirname } from "node:path";
import {
  composeHostEnvironments,
  environmentStoreLeaseFromCustody,
  type ComposedHostEnvironments,
} from "@/host/environments/composeHostEnvironments";
import type { BackendHostInitializePayload } from "@/shared/backendHostProtocol";
import type { BackendHostCore } from "./BackendHostCore";

/** The backend owns its environment manager; Electron's device-local utility
 * has a separate lifetime and never acts as this host's authority. */
export async function composeBackendEnvironments(
  initialize: BackendHostInitializePayload,
  host: Pick<BackendHostCore, "getDataCustody">,
): Promise<ComposedHostEnvironments | null> {
  const assets = initialize.desktop?.environmentAssets;
  if (!assets) return null;
  const custody = host.getDataCustody();
  if (!custody) throw new Error("Host-owned environments require the backend data fence.");
  custody.assertActive();
  const supervisor = initialize.supervisor;
  return composeHostEnvironments({
    baseDir: initialize.baseDir,
    lease: environmentStoreLeaseFromCustody(initialize.baseDir, custody),
    inputs: {
      mainBundleDir: dirname(supervisor.supervisorPath),
      agentPluginsDir: assets.agentPluginsDir,
      wslHelpersDir: supervisor.wslHelpersDir,
      ...(supervisor.bundledSkillsDir ? { bundledSkillsDir: supervisor.bundledSkillsDir } : {}),
      ...(supervisor.bundledPluginsDir ? { bundledPluginsDir: supervisor.bundledPluginsDir } : {}),
      ...(assets.preassembledArchiveDir
        ? { preassembledArchiveDir: assets.preassembledArchiveDir }
        : {}),
    },
  });
}
