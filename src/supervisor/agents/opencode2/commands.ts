import type { AgentSlashCommand } from "@/shared/contracts";
import type { OpenCode2Client } from "./clientTypes";
import type { OpenCode2PromptPayload } from "./promptText";

export type OpenCode2Command = AgentSlashCommand & { nativeAction?: "compact" | "agent" };

export function mapOpenCode2Commands(
  commands: ReadonlyArray<{ name: string; description?: string }>,
): OpenCode2Command[] {
  const mapped: OpenCode2Command[] = commands.flatMap(({ name, description }) => {
    const id = name.trim();
    if (!id) return [];
    return [{ id, label: id, ...(description ? { description } : {}) }];
  });
  if (!mapped.some(({ id }) => id === "compact"))
    mapped.push({ id: "compact", label: "compact", nativeAction: "compact" });
  return mapped;
}

/** Dispatch registered commands through the server so templates and agent/model overrides apply. */
export async function submitOpenCode2Prompt(
  client: OpenCode2Client,
  sessionID: string,
  payload: OpenCode2PromptPayload,
  commands: readonly OpenCode2Command[],
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
    await client.session.command({ ...shared, command, text: match[2] ?? "" });
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

export function mapOpenCode2Skills(
  skills: ReadonlyArray<{ id: string; name: string; description?: string; location: string }>,
  directory = "",
): AgentSlashCommand[] {
  return skills.map((skill) => ({
    id: `skill:${skill.id}`,
    label: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    section: "skills",
    skillName: skill.id,
    skillInvocation: `/skill ${skill.id}`,
    skillProvider: "opencode2",
    skillScope:
      directory &&
      skill.location.replaceAll("\\", "/").startsWith(directory.replaceAll("\\", "/") + "/")
        ? "project"
        : "global",
  }));
}

export function mapOpenCode2Agents(
  agents: ReadonlyArray<{
    id: string;
    name: string;
    description?: string;
    hidden: boolean;
    mode: string;
  }>,
): OpenCode2Command[] {
  return agents
    .filter((agent) => !agent.hidden && agent.mode !== "subagent")
    .map((agent) => ({
      id: `agent/${agent.id}`,
      nativeAction: "agent" as const,
      label: `agent/${agent.id}`,
      ...(agent.description ? { description: agent.description } : {}),
    }));
}
