import type { RemoteAccessServerOptions } from "../remoteAccessServerTypes";
import { EnvironmentProxyGateway } from "./environmentProxy";
import type { EnvironmentManagementRuntime } from "./environmentManagement";
import type {
  EnvironmentProxyBaseUrls,
  EnvironmentProxySessionAuthority,
  EnvironmentProxyTargetRegistry,
} from "./types";

/** Bind management and proxy target resolution to the same host authority.
 * Each listener owns its gateway; the host keeps the runtime across listener
 * replacement. Parent authentication remains the listener's existing store. */
export function environmentRemoteAccessOptions(
  runtime: EnvironmentManagementRuntime & EnvironmentProxyTargetRegistry,
  authority: EnvironmentProxySessionAuthority,
  baseUrls: () => EnvironmentProxyBaseUrls,
): Required<Pick<RemoteAccessServerOptions, "environmentManagement" | "environmentProxy">> {
  return {
    environmentManagement: runtime,
    environmentProxy: ({ principalAdmission }) =>
      new EnvironmentProxyGateway({ targets: runtime, authority, baseUrls, principalAdmission }),
  };
}
