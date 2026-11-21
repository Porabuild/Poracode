import type { AgentSlashCommand } from "@/shared/contracts";
import type { OpenCodeClient } from "./clientTypes";
import type { OpenCodePromptPayload } from "./promptText";

export type OpenCodeCommand = AgentSlashCommand & { nativeAction?: "compact" | "agent" };

export function mapOpenCodeCommands(
  commands: ReadonlyArray<{ name: string; description?: string }>,
): OpenCodeCommand[] {
  const mapped: OpenCodeCommand[] = commands.flatMap(({ name, description }) => {
    const id = name.trim();
    if (!id) return [];
    return [{ id, label: id, ...(description ? { description } : {}) }];
  });
  if (!mapped.some(({ id }) => id === "compact"))
    mapped.push({ id: "compact", label: "compact", nativeAction: "compact" });
  return mapped;
}

/** Dispatch registered commands through the server so templates and agent/model overrides apply. */
export async function submitOpenCodePrompt(
  client: OpenCodeClient,
  sessionID: string,
  payload: OpenCodePromptPayload,
  commands: readonly OpenCodeCommand[],
  delivery?: "steer",
): Promise<void> {
  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(payload.text.trim());
  const command = match?.[1];
  const shared = {
    sessionID,
    ...(payload.files.length > 0 ? { files: payload.files } : {}),
    ...(delivery ? { delivery } : {}),
    ...(payload.skills?.length ? { skills: payload.skills } : {}),
  };
  if (
    command === "compact" &&
    !match?.[2] &&
    commands.some((entry) => entry.id === command && entry.nativeAction === "compact")
  ) {
    await client.session.compact({ sessionID, ...(delivery ? { delivery } : {}) });
    return;
  }
  if (command && commands.some(({ id, section }) => id === command && section !== "skills")) {
    await client.session.command({ ...shared, name: command, text: match[2] ?? "" });
    return;
  }
  const skillMatch = /^\/skill\s+(\S+)(?:\s+([\s\S]*))?$/.exec(payload.text.trim());
  const skill =
    skillMatch &&
    commands.find((entry) => entry.section === "skills" && entry.skillName === skillMatch[1]);
  if (skill?.skillName) {
    await client.session.prompt({
      ...shared,
      text: skillMatch?.[2] ?? skill.label,
      skills: [...(payload.skills ?? []), { id: skill.skillName }],
    });
    return;
  }
  await client.session.prompt({
    ...shared,
    text: payload.text,
    ...(payload.skills?.length ? { skills: payload.skills } : {}),
  });
}

export function mapOpenCodeSkills(
  skills: ReadonlyArray<{
    id: string;
    name: string;
    description?: string;
    /** Older servers return `location`; current servers return `path`. */
    location?: string;
    path?: string;
  }>,
  directory = "",
): AgentSlashCommand[] {
  return skills.map((skill) => ({
    id: `skill:${skill.id}`,
    label: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    section: "skills",
    skillName: skill.id,
    skillInvocation: `/skill ${skill.id}`,
    skillProvider: "opencode",
    skillScope:
      directory &&
      (skill.path ?? skill.location ?? "")
        .replaceAll("\\", "/")
        .startsWith(directory.replaceAll("\\", "/") + "/")
        ? "project"
        : "global",
  }));
}

export function mapOpenCodeAgents(
  agents: ReadonlyArray<{
    id: string;
    name: string;
    description?: string;
    hidden: boolean;
    mode: string;
  }>,
): OpenCodeCommand[] {
  return agents
    .filter((agent) => !agent.hidden && agent.mode !== "subagent")
    .map((agent) => ({
      id: `agent/${agent.id}`,
      nativeAction: "agent" as const,
      label: `agent/${agent.id}`,
      ...(agent.description ? { description: agent.description } : {}),
    }));
}
