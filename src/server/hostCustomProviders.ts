import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAbsolute } from "node:path";
import {
  acpGenericKind,
  acpGenericInstanceConfigSchema,
  parseAcpGenericInstanceConfig,
  type AgentInstanceConfig,
} from "@/shared/contracts/agentInstance";
import {
  AGENT_INSTANCE_REMOVAL_FIELDS,
  removeAgentInstanceSettings,
} from "@/shared/agentInstanceSettings";
import { assertAgentProfileDependencies } from "@/shared/agentProfileDependencies";
import {
  customAcpAgentCommandSchema,
  customAcpAgentResultSchema,
  CUSTOM_ACP_AGENTS_VERSION,
  type CustomAcpAgentCommand,
} from "@/shared/contracts/customAcpAgents";
import { encryptSecret } from "@/shared/secretStorage";
import type { SharedSettings } from "@/shared/settings";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import type { HeadlessSettingsComposition } from "./headlessSettingsAuthority";
import { canonicalSettingsJson } from "@/backend/settings/settingsSubjects";

/** Trusted local intent; every mutation is derived from the authority's fresh CAS snapshot. */
export class HostCustomProviders {
  private readonly revisionKey = randomBytes(32);
  constructor(
    private readonly options: {
      settings: Pick<HeadlessSettingsComposition, "editSettingsFields">;
      readSettings(): SharedSettings;
      assertCanPersistSecrets(): void;
      onChanged?(agentKind: string): Promise<void>;
    },
  ) {}

  private revision(instance: AgentInstanceConfig) {
    return createHmac("sha256", this.revisionKey)
      .update(canonicalSettingsJson(instance))
      .digest("hex");
  }

  private require(settings: SharedSettings, id: string) {
    const instance = Object.hasOwn(settings.agentInstances, id)
      ? settings.agentInstances[id]
      : undefined;
    if (
      !instance ||
      instance.driver !== "acp-generic" ||
      Object.hasOwn(settings.acpRegistryInstalledAgents, id)
    )
      throw new Error(
        "Custom ACP registration not found. Registry installations and built-in profiles are managed separately.",
      );
    const config = parseAcpGenericInstanceConfig(instance.config);
    if (
      !config.environmentCommands?.native ||
      Object.keys(config.environmentCommands.wsl ?? {}).length
    )
      throw new Error(
        "This registration is not explicitly native-only. Its existing configuration was left unchanged.",
      );
    return instance;
  }

  private summary(instance: AgentInstanceConfig) {
    const config = parseAcpGenericInstanceConfig(instance.config);
    const command = config.environmentCommands!.native!;
    return {
      id: instance.id,
      kind: acpGenericKind(instance.id),
      displayName: instance.displayName ?? instance.id,
      enabled: instance.enabled !== false,
      revision: this.revision(instance),
      command: {
        binary: command.binary,
        argumentCount: command.args?.length ?? 0,
        cwd: config.cwd,
        ...(config.fixedCwd ? { fixedCwd: config.fixedCwd } : {}),
      },
      environmentNames: Object.keys(instance.environment ?? {}),
      authMode: config.authMode,
      ...(config.authEnvVar ? { authEnvVar: config.authEnvVar } : {}),
      models: config.capabilities?.models ?? [],
    };
  }

  private config(definition: Extract<CustomAcpAgentCommand, { action: "add" }>["definition"]) {
    if (definition.cwd === "fixed" && !isAbsolute(definition.fixedCwd!))
      throw new Error("fixedCwd must be an absolute native path on the server.");
    return parseAcpGenericInstanceConfig({
      ...definition,
      environmentCommands: {
        native: {
          binary: definition.binary,
          ...(definition.args ? { args: definition.args } : {}),
        },
      },
    });
  }

  async execute(input: CustomAcpAgentCommand, context: HostControlContext) {
    const command = customAcpAgentCommandSchema.parse(input);
    context.assertActive();
    if (
      ("environment" in command && Object.keys(command.environment ?? {}).length) ||
      (command.action === "check-add" && command.environmentNames.length)
    )
      this.options.assertCanPersistSecrets();
    const settings = this.options.readSettings();
    const response = {
      version: CUSTOM_ACP_AGENTS_VERSION,
      scope: "custom-native-acp" as const,
      action: command.action,
    };
    if (command.action === "list") {
      const agents = Object.values(settings.agentInstances)
        .filter(
          (instance) =>
            instance.driver === "acp-generic" &&
            !Object.hasOwn(settings.acpRegistryInstalledAgents, instance.id),
        )
        .filter((instance) => {
          const config = acpGenericInstanceConfigSchema.safeParse(instance.config);
          return (
            config.success &&
            config.data.environmentCommands?.native &&
            !Object.keys(config.data.environmentCommands.wsl ?? {}).length
          );
        })
        .map((instance) => this.summary(instance));
      return customAcpAgentResultSchema.parse({ ...response, agents });
    }
    if (command.action === "inspect")
      return customAcpAgentResultSchema.parse({
        ...response,
        agent: this.summary(this.require(settings, command.id)),
      });
    const assertNew = (current: SharedSettings) => {
      if (
        Object.hasOwn(current.agentInstances, command.id) ||
        Object.hasOwn(current.acpRegistryInstalledAgents, command.id)
      )
        throw new Error(
          "That provider ID is already configured. Inspect it explicitly; nothing was replaced.",
        );
    };
    if (command.action === "check-add") {
      assertNew(settings);
      this.config(command.definition);
      return customAcpAgentResultSchema.parse({ ...response, id: command.id, checked: true });
    }
    let changed: AgentInstanceConfig | undefined;
    const fields =
      command.action === "remove" ? AGENT_INSTANCE_REMOVAL_FIELDS : (["agentInstances"] as const);
    const result = await this.options.settings.editSettingsFields(fields, (current) => {
      context.assertActive();
      const next = { ...current };
      if (command.action === "add") {
        assertNew(current);
        changed = {
          id: command.id,
          driver: "acp-generic",
          displayName: command.displayName,
          enabled: true,
          config: this.config(command.definition),
          ...(command.environment
            ? {
                environment: Object.fromEntries(
                  Object.entries(command.environment)
                    .filter(([, value]) => value.length > 0)
                    .map(([name, value]) => [
                      name,
                      { value: encryptSecret("", value), sensitive: true },
                    ]),
                ),
              }
            : {}),
        };
        next.agentInstances = { ...current.agentInstances, [changed.id]: changed };
      } else {
        const instance = this.require(current, command.id);
        if (
          !timingSafeEqual(
            Buffer.from(command.expectedRevision, "hex"),
            Buffer.from(this.revision(instance), "hex"),
          )
        )
          throw new Error(
            "The selected registration changed. Inspect it again before making changes.",
          );
        if (command.action === "remove")
          Object.assign(next, removeAgentInstanceSettings(current, instance));
        else {
          const environment = { ...instance.environment };
          for (const [name, value] of Object.entries(command.environment ?? {})) {
            if (value) environment[name] = { value: encryptSecret("", value), sensitive: true };
            else delete environment[name];
          }
          const { authAcknowledged, ...withoutAcknowledgement } = instance;
          changed = {
            ...(command.definition || command.environment !== undefined
              ? withoutAcknowledgement
              : { ...withoutAcknowledgement, ...(authAcknowledged ? { authAcknowledged } : {}) }),
            ...(command.displayName ? { displayName: command.displayName } : {}),
            ...(command.enabled !== undefined ? { enabled: command.enabled } : {}),
            ...(command.definition ? { config: this.config(command.definition) } : {}),
            ...(command.environment !== undefined ? { environment } : {}),
          };
          next.agentInstances = { ...current.agentInstances, [changed.id]: changed };
        }
      }
      assertAgentProfileDependencies(current.agentInstances, next.agentInstances);
      return next;
    });
    if (result.status !== "committed")
      throw new Error(
        `Custom registration was not committed (${result.status}). Inspect before retrying.`,
      );
    context.assertActive();
    await this.options.onChanged?.(acpGenericKind(command.id));
    return customAcpAgentResultSchema.parse(
      command.action === "remove"
        ? { ...response, id: command.id, removed: true }
        : { ...response, agent: this.summary(changed!) },
    );
  }
}
