import { z } from "zod";
import {
  agentConnectedProviderSchema,
  manageAgentCredentialsPayloadSchema,
  manageAgentPluginsPayloadSchema,
  manageModelProvidersResultSchema,
  modelProviderOperationSchema,
  modelProviderTargetSchema,
  type ManageModelProvidersPayload,
} from "@/shared/contracts";
import type { AgentEnv } from "@/shared/machines";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime, type AppControlsToolContext } from "./types";

const [listModelProviders, saveModelProvider, removeModelProvider] =
  modelProviderOperationSchema.options;
const providerTarget = z.strictObject({
  agentKind: manageAgentCredentialsPayloadSchema.shape.agentKind,
  env: manageAgentCredentialsPayloadSchema.shape.env,
});

async function refreshProvider(ctx: AppControlsToolContext, agentKind: string, env: AgentEnv) {
  try {
    await ctx.supervisor.refreshAgentStatuses({
      wslDistros: env.kind === "wsl" ? [env.distro] : [],
      scope: { agentKinds: [agentKind], envs: [env] },
    });
    return {};
  } catch {
    return {
      refreshWarning:
        "Settings changed. Use list_installed_agents with refresh:true to refresh discovery.",
    };
  }
}

function publicBaseUrl(value: string): string {
  if (!URL.canParse(value)) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

const modelProviderTool = defineAppControlTool({
  name: "manage_model_providers",
  description:
    "List, save, or remove model routes for a provider that supports the app's Model Provider settings. Supply agentKind and env (native or a specific WSL distro). List returns routes, templates, credential presence, and the revision required by save and remove. Save uses create:true for a new route and false to edit. API keys are write-only. Endpoint replies omit query and fragment text. Omit baseURL on an edit to preserve the stored URL and omit apiKey to preserve the key. Change settings only at the user's request.",
  input: z.discriminatedUnion("action", [
    listModelProviders.extend(modelProviderTargetSchema.shape).strict(),
    saveModelProvider
      .extend({
        ...modelProviderTargetSchema.shape,
        apiKey: saveModelProvider.shape.apiKey.meta({ writeOnly: true }),
        provider: saveModelProvider.shape.provider.partial({ baseURL: true }).strict(),
      })
      .strict(),
    removeModelProvider.extend(modelProviderTargetSchema.shape).strict(),
  ]),
  run: async (input, ctx) => {
    const runtime = requireAppRuntime(ctx);
    const storesKey = input.action === "save" && Boolean(input.apiKey);
    if (storesKey) ctx.assertCanPersistSecrets();
    let command: ManageModelProvidersPayload;
    if (input.action === "save") {
      let baseURL = input.provider.baseURL;
      if (baseURL === undefined && !input.create) {
        const current = manageModelProvidersResultSchema.parse(
          await runtime.call("manageModelProviders", {
            action: "list",
            agentKind: input.agentKind,
            env: input.env,
          }),
        );
        if (!current.ok) return current;
        if (current.revision !== input.revision) return { ok: false, reason: "conflict" };
        const saved = current.providers.find(({ id }) => id === input.provider.id);
        if (!saved) return { ok: false, reason: "conflict" };
        baseURL = saved.baseURL;
      }
      command = { ...input, provider: { ...input.provider, baseURL: baseURL ?? "" } };
    } else {
      command = input;
    }
    const raw = await runtime.call("manageModelProviders", command).catch((error: unknown) => {
      if (storesKey)
        throw new Error(
          "Model provider save could not be confirmed. List the routes and credential status before retrying.",
        );
      throw error;
    });
    const result = manageModelProvidersResultSchema.parse(raw);
    if (!result.ok) return result;
    return {
      ...result,
      catalog: result.catalog.map((entry) => ({ ...entry, baseURL: publicBaseUrl(entry.baseURL) })),
      providers: result.providers.map((entry) => ({
        ...entry,
        baseURL: publicBaseUrl(entry.baseURL),
      })),
      ...(input.action === "list" ? {} : await refreshProvider(ctx, input.agentKind, input.env)),
    };
  },
});

const providerCredentialsTool = defineAppControlTool({
  name: "manage_provider_credentials",
  description:
    "List connected upstream accounts or sign out of one for a provider that supports the app's account settings. Supply agentKind and env (native or a WSL distro). List returns account labels and removable IDs. At the user's request, remove uses the exact credentialId from the list.",
  input: z.discriminatedUnion("action", [
    providerTarget.extend({ action: z.literal("list") }),
    providerTarget.extend({
      action: z.literal("remove"),
      credentialId: manageAgentCredentialsPayloadSchema.shape.credentialId.unwrap(),
    }),
  ]),
  run: async (input, ctx) => {
    const { providers } = await requireAppRuntime(ctx).call("manageAgentCredentials", input);
    return {
      providers: z.array(agentConnectedProviderSchema).parse(providers),
      ...(input.action === "remove" ? await refreshProvider(ctx, input.agentKind, input.env) : {}),
    };
  },
});

const pluginTarget = manageAgentPluginsPayloadSchema.shape.target;
const providerPluginsTool = defineAppControlTool({
  name: "manage_provider_plugins",
  description:
    "Manage the agent's native plugin packages in a specific native or WSL environment. list shows configured packages and check discovers updates. At the user's request, install, update, or remove an exact package target. Use list_plugins for Poracode's own plugins.",
  input: z.discriminatedUnion("action", [
    providerTarget.extend({
      action: manageAgentPluginsPayloadSchema.shape.action.extract(["list", "check"]),
      target: pluginTarget,
    }),
    providerTarget.extend({
      action: manageAgentPluginsPayloadSchema.shape.action.extract(["install", "update", "remove"]),
      target: pluginTarget.unwrap(),
    }),
  ]),
  run: async (input, ctx) => {
    const { packages } = await requireAppRuntime(ctx).call("manageAgentPlugins", input);
    return {
      packages: packages.map(({ target, id, version, status, outdated, server, terminal }) => ({
        target,
        id,
        version,
        status,
        outdated,
        server,
        terminal,
      })),
    };
  },
});

export const providerSettingsTools = appControlToolDomain(
  modelProviderTool,
  providerCredentialsTool,
  providerPluginsTool,
);
