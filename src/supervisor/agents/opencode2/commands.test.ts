import { describe, expect, it, vi } from "vitest";
import type { OpenCode2Client } from "./clientTypes";
import { mapOpenCode2Commands, mapOpenCode2Skills, submitOpenCode2Prompt } from "./commands";

function clientFixture() {
  const session = {
    command: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    prompt: vi.fn<() => Promise<object>>().mockResolvedValue({}),
  };
  return { client: { session } as unknown as OpenCode2Client, session };
}

describe("OpenCode 2 commands", () => {
  it.each(["location", "path"] as const)("maps skill scope from the server's %s field", (field) => {
    const commands = mapOpenCode2Skills(
      [
        { id: "review", name: "Review", [field]: "/repo/.agents/skills/review/SKILL.md" },
        { id: "global", name: "Global", [field]: "/home/user/.agents/skills/global/SKILL.md" },
      ],
      "/repo",
    );
    expect(commands.map(({ skillScope }) => skillScope)).toEqual(["project", "global"]);
    expect(commands[0]).toMatchObject({ skillName: "review", skillInvocation: "/skill review" });
  });

  it("dispatches a registered nested command with arguments, attachments and delivery", async () => {
    const { client, session } = clientFixture();
    const files = [{ uri: "file:///repo/screenshot.png", name: "screenshot.png" }];
    await submitOpenCode2Prompt(
      client,
      "s",
      { text: '/team/review src "test coverage"', files, skills: [{ id: "review-guide" }] },
      mapOpenCode2Commands([{ name: "team/review", description: "Review changes" }]),
      "steer",
    );
    expect(session.command).toHaveBeenCalledWith({
      sessionID: "s",
      name: "team/review",
      text: 'src "test coverage"',
      files,
      delivery: "steer",
      skills: [{ id: "review-guide" }],
    });
    expect(session.prompt).not.toHaveBeenCalled();
  });

  it("keeps unknown slash text intact and exposes native command failures", async () => {
    const { client, session } = clientFixture();
    const payload = { text: "/unknown arguments", files: [] };
    await submitOpenCode2Prompt(client, "s", payload, []);
    expect(session.prompt).toHaveBeenCalledWith({ sessionID: "s", text: payload.text });
    session.command.mockRejectedValueOnce(new Error("template failed"));
    await expect(
      submitOpenCode2Prompt(client, "s", { text: "/review", files: [] }, [
        { id: "review", label: "review" },
      ]),
    ).rejects.toThrow("template failed");
    expect(session.prompt).toHaveBeenCalledTimes(1);
  });
});
