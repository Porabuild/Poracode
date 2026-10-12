import { createHash } from "node:crypto";
import { homedir } from "node:os";
import {
  createUsageCollectorRegistry,
  type HostPort,
  type OAuthToken,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import type { ProjectLocation } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { parseDevinProfileConfig } from "@/shared/agents/devin/profileConfig";
import { devinUsageAccountId } from "@/shared/agents/devin/usageAccount";
import type { UsageProfileCollector, UsageProfileSource } from "../../runtime/usageProfileTypes";
import { readDevinCredentialsAt } from "./credentials";
import { devinExecutionSettingsFromConfig, resolveDevinExecutionContext } from "./profileContext";

const registry = createUsageCollectorRegistry();
type CredentialView =
  | { available: true; token: OAuthToken | undefined; source: string }
  | { available: false };

export interface DevinUsageProfileOptions {
  readScopedCredentials?: (path: string) => Promise<OAuthToken | undefined>;
}

/** Read-only account views; shared-login configurations and owner references do
 * not create additional meters or HTTP requests. Native login owns credentials. */
export function createDevinUsageProfileSource(
  settings: SharedSettings,
  options: DevinUsageProfileOptions = {},
): UsageProfileSource {
  const readScoped = options.readScopedCredentials ?? readDevinCredentialsAt;
  const views = new Map<string, (host: HostPort) => Promise<CredentialView>>();
  views.set("devin", async (host) => ({
    available: true,
    token: await host.credentials.getOAuthToken("devin"),
    source: "native-default",
  }));
  for (const instance of Object.values(settings.agentInstances)) {
    const id = devinUsageAccountId(instance, settings.agentInstances);
    const parsed = parseDevinProfileConfig(instance.config);
    if (
      !id ||
      id === "devin" ||
      parsed.status !== "ok" ||
      parsed.config.auth.kind !== "isolated-owner"
    )
      continue;
    const environment = Object.fromEntries(
      Object.entries(instance.environment ?? {}).map(([key, entry]) => [key, entry.value]),
    );
    const profile = devinExecutionSettingsFromConfig(
      instance.id,
      instance.displayName ?? instance.id,
      parsed.config,
      environment,
    );
    views.set(id, async () => {
      const location: ProjectLocation = {
        kind: process.platform === "win32" ? "windows" : "posix",
        path: homedir(),
      };
      const resolved = await resolveDevinExecutionContext(profile, location, { provision: false });
      if (!resolved.ok) return { available: false };
      return {
        available: true,
        token: await readScoped(resolved.context.roots.credentialsPath),
        source: resolved.context.generation,
      };
    });
  }
  const collectors: UsageProfileCollector[] = [...views].map(([providerId, readView]) => ({
    providerId,
    cacheIdentity: async (host) => {
      const view = await readView(host);
      // Fingerprints never contain a raw credential, endpoint or environment.
      return createHash("sha256").update(JSON.stringify(view)).digest("hex");
    },
    collect: async (host): Promise<UsageSnapshot> => {
      const view = await readView(host);
      if (!view.available)
        return { providerId, status: "unsupported", fetchedAt: host.now(), windows: [] };
      const scopedHost: HostPort = {
        ...host,
        credentials: {
          ...host.credentials,
          getOAuthToken: async (id) =>
            id === "devin" ? view.token : host.credentials.getOAuthToken(id),
        },
      };
      const snapshot = await registry.collect("devin", scopedHost);
      return { ...snapshot, providerId };
    },
  }));
  return { collectors };
}
