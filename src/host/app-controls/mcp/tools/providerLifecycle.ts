import { z } from "zod";
import {
  acpRegistryMutationResultSchema,
  agentHookPluginMutationResultSchema,
  agentHookPluginPayloadSchema,
  agentHookPluginStatusSchema,
  agentKindSchema,
  getAgentHookPluginStatusesPayloadSchema,
  getLatestAgentVersionPayloadSchema,
  installAcpRegistryAgentPayloadSchema,
  removeAcpRegistryAgentPayloadSchema,
  updateAcpRegistryAgentPayloadSchema,
} from "@/shared/contracts";
import { agentEnvSchema } from "@/shared/machines";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";
import { requireAppRuntime } from "./types";

const listFields = { ...catalogPageFields, limit: catalogPageFields.limit.unwrap().default(30) };
const installationTool = defineAppControlTool({
  name: "manage_provider_installation",
  description:
    "Manage provider installations using the app's ACP Registry and updater. registry searches the registry by query. installed lists saved registry installations without a network lookup. Use nextOffset as offset for the next page. install and update_registry take an exact registry agentId and optional native or WSL target. remove removes a registry agent across its environments and stops its threads. latest_version and update_binary use the detected agentKind. Request user authorization before installing, updating, or removing a provider.",
  input: z.discriminatedUnion("action", [
    z.strictObject({
      action: z.literal("registry"),
      query: z.string().trim().min(1).optional(),
      ...listFields,
    }),
    z.strictObject({ action: z.literal("installed"), ...listFields }),
    installAcpRegistryAgentPayloadSchema.extend({ action: z.literal("install") }).strict(),
    updateAcpRegistryAgentPayloadSchema.extend({ action: z.literal("update_registry") }).strict(),
    removeAcpRegistryAgentPayloadSchema.extend({ action: z.literal("remove") }).strict(),
    getLatestAgentVersionPayloadSchema.extend({ action: z.literal("latest_version") }).strict(),
    z.strictObject({
      action: z.literal("update_binary"),
      agentKind: agentKindSchema,
      env: agentEnvSchema,
    }),
  ]),
  run: async (input, ctx) => {
    if (input.action === "installed") {
      const installed = Object.values(ctx.settings.read().acpRegistryInstalledAgents);
      const { rows, ...page } = pageCatalog(installed, input.offset, input.limit);
      return { ...page, installed: rows };
    }
    const runtime = requireAppRuntime(ctx);
    if (input.action === "registry") {
      const { version: registryVersion, agents } = await runtime.call("listAcpRegistry", {});
      const query = input.query?.toLowerCase();
      const matches = query
        ? agents.filter(({ id, name, description }) =>
            [id, name, description].some((value) => value.toLowerCase().includes(query)),
          )
        : agents;
      const { rows, ...page } = pageCatalog(matches, input.offset, input.limit);
      return {
        version: registryVersion,
        ...page,
        agents: rows.map(({ id, name, version, description, repository, website }) => ({
          id,
          name,
          version,
          description,
          repository,
          website,
        })),
      };
    }
    if (input.action === "update_binary") {
      const { agentKind, env } = input;
      const { ok, strategy } = await runtime.call("updateAgentBinary", {
        agentKind,
        ...(env.kind === "wsl"
          ? { envKind: "wsl", wslDistro: env.distro }
          : { envKind: process.platform === "win32" ? "windows" : "posix" }),
      });
      return { ok, strategy };
    }
    if (input.action === "latest_version") {
      const { action: _action, ...payload } = input;
      return runtime.call("getLatestAgentVersion", payload);
    }
    if (input.action === "remove") {
      const installed = ctx.settings.read().acpRegistryInstalledAgents;
      const record = Object.hasOwn(installed, input.agentId) ? installed[input.agentId] : undefined;
      if (!record) throw new Error("No registry installation has this agentId.");
      const caller = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
      if (record.adapterKind === caller?.agentKind) {
        throw new Error("Remove this installation from a thread using a different provider.");
      }
      return acpRegistryMutationResultSchema.parse(
        await runtime.call("removeAcpRegistryAgent", { agentId: input.agentId }),
      );
    }
    const { action, ...payload } = input;
    const result =
      action === "install"
        ? await runtime.call("installAcpRegistryAgent", payload)
        : await runtime.call("updateAcpRegistryAgent", payload);
    return acpRegistryMutationResultSchema.parse(result);
  },
});

const hooksTool = defineAppControlTool({
  name: "manage_provider_hooks",
  description:
    "Inspect or manage the app's bundled hook integration for a provider. status takes agentKind and an array of native or WSL environments. At the user's request, install or uninstall takes agentKind and one environment. Returns the owning provider's hook status.",
  input: z.discriminatedUnion("action", [
    getAgentHookPluginStatusesPayloadSchema.extend({ action: z.literal("status") }).strict(),
    agentHookPluginPayloadSchema.extend({ action: z.enum(["install", "uninstall"]) }).strict(),
  ]),
  run: async (input, ctx) => {
    const runtime = requireAppRuntime(ctx);
    if (input.action === "status") {
      const { action: _action, ...payload } = input;
      const result = await runtime.call("getAgentHookPluginStatuses", payload);
      return { statuses: z.array(agentHookPluginStatusSchema).parse(result) };
    }
    const { action, ...payload } = input;
    const result =
      action === "install"
        ? await runtime.call("installAgentHookPlugin", payload)
        : await runtime.call("uninstallAgentHookPlugin", payload);
    return agentHookPluginMutationResultSchema.parse(result);
  },
});

export const providerLifecycleTools = appControlToolDomain(installationTool, hooksTool);
