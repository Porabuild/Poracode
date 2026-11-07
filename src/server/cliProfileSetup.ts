import { z } from "zod";
import { agentInstanceIdSchema } from "@/shared/contracts/agentInstance";
import {
  hostAdminProfileCreationCheckSchema,
  hostAdminProfileCreationInputSchema,
  hostAdminProfilePreparationSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { promptCli, terminalText } from "./cliPrompts";

export const environmentNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u);

export function validateProfileEnvironmentNames(value: unknown): string[] {
  const names = z.array(environmentNameSchema).min(1).max(200).safeParse(value);
  if (!names.success || new Set(names.data).size !== names.data.length)
    throw new Error(
      "Use --prompt-env NAME once per unique environment name (letters, digits and underscores).",
    );
  if (names.data.includes("__proto__"))
    throw new Error("__proto__ is not a supported profile environment name; nothing was saved.");
  return names.data;
}

export async function collectProfileConfiguration(
  request: (command: HostAdminCommand) => Promise<unknown>,
  target:
    | {
        action: "add";
        id: string;
        names: string[];
        profile: Extract<HostAdminCommand, { action: "providers-add" }>["profile"];
      }
    | { action: "configure"; id?: string; names?: string[]; askNames: boolean },
) {
  const profiles =
    target.action === "configure"
      ? z
          .object({
            profiles: z.array(
              z.object({
                id: z.string(),
                displayName: z.string().optional(),
                driver: z.string().optional(),
                enabled: z.boolean().optional(),
              }),
            ),
          })
          .parse(await request({ action: "providers-list" })).profiles
      : [];
  let id = target.id;
  if (!id) {
    if (!profiles.length)
      throw new Error(
        "No saved provider profiles. Run providers drivers for supported driver IDs, then providers add <id> --driver <driver> with its config, or setup --start --new-profile <id> --driver <driver> --profile-config-file JSON --prompt-env NAME. Registry installations are separate from saved profiles.",
      );
    profiles.forEach((profile, index) =>
      process.stderr.write(
        `${index + 1}. ${terminalText(profile.displayName ?? profile.id)} (${terminalText(profile.id)}${profile.driver ? `; ${terminalText(profile.driver)}` : ""}${profile.enabled === false ? "; disabled" : ""})\n`,
      ),
    );
    const selected = Number(await promptCli("Profile number: "));
    const profile = Number.isInteger(selected) ? profiles[selected - 1] : undefined;
    if (!profile) throw new Error("Invalid profile selection; nothing was saved.");
    id = profile.id;
  }
  if (!agentInstanceIdSchema.safeParse(id).success)
    throw new Error(
      "The selected profile ID is not supported by this CLI; no values were collected or saved.",
    );
  const selected = profiles.find((profile) => profile.id === id);
  if (target.action === "configure" && !selected)
    throw new Error("Profile not found. Run providers list; no other profile was selected.");
  let expectedProfileRevision: string | undefined;
  if (target.action === "add") {
    const checked = hostAdminProfileCreationCheckSchema.parse(
      await request({
        action: "providers-check-add",
        profile: hostAdminProfileCreationInputSchema.parse(target.profile),
        environmentNames: target.names,
      }),
    );
    if (checked.profileId !== id || checked.driver !== target.profile.driver)
      throw new Error(
        "The owner did not check the requested profile/driver. No values were collected or saved.",
      );
  } else {
    const prepared = hostAdminProfilePreparationSchema.parse(
      await request({
        action: "providers-prepare-configuration",
        instanceId: id,
      }),
    );
    if (
      prepared.profileId !== id ||
      (selected?.driver !== undefined && selected.driver !== prepared.driver) ||
      (selected?.displayName !== undefined && selected.displayName !== prepared.displayName)
    )
      throw new Error(
        "The selected profile changed. No values were collected or saved; run providers configure again.",
      );
    expectedProfileRevision = prepared.profileRevision;
  }
  const names =
    target.action === "configure" && target.askNames
      ? validateProfileEnvironmentNames(
          (await promptCli("Environment variable names (comma-separated; values will be hidden): "))
            .split(",")
            .map((name) => name.trim()),
        )
      : target.names;
  const revision = expectedProfileRevision ? { expectedProfileRevision } : {};
  if (!names) return { id, ...revision };
  const entries: Array<[string, string]> = [];
  for (const name of names) {
    const value = await promptCli(`${name} (hidden): `, { secret: true });
    if (!value.length || value.length > 16_384)
      throw new Error("Environment values must contain 1–16384 characters. Nothing was saved.");
    entries.push([name, value]);
  }
  return { id, ...revision, environment: Object.fromEntries(entries) };
}
