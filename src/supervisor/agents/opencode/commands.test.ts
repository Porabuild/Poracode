import { describe, expect, it, vi } from "vitest";
import { structuredTurnTextOptions } from "../../runtime/turnClientContext";
import type { OpenCodeClient } from "./clientTypes";
import { mapOpenCodeCommands, mapOpenCodeSkills, submitOpenCodePrompt } from "./commands";
import { buildOpenCodePromptPayload } from "./promptText";

function clientFixture() {
  const session = {
    command: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    compact: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    prompt: vi.fn<() => Promise<object>>().mockResolvedValue({}),
  };
  return { client: { session } as unknown as OpenCodeClient, session };
}

describe("OpenCode commands", () => {
  it.each(["location", "path"] as const)("maps skill scope from the server's %s field", (field) => {
    const commands = mapOpenCodeSkills(
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
    await submitOpenCodePrompt(
      client,
      "s",
      { text: '/team/review src "test coverage"', files, skills: [{ id: "review-guide" }] },
      mapOpenCodeCommands([{ name: "team/review", description: "Review changes" }]),
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
    await submitOpenCodePrompt(client, "s", payload, []);
    expect(session.prompt).toHaveBeenCalledWith({ sessionID: "s", text: payload.text });
    session.command.mockRejectedValueOnce(new Error("template failed"));
    await expect(
      submitOpenCodePrompt(client, "s", { text: "/review", files: [] }, [
        { id: "review", label: "review" },
      ]),
    ).rejects.toThrow("template failed");
    expect(session.prompt).toHaveBeenCalledTimes(1);
  });

  describe("with per-turn client context from the shared runtime", () => {
    const commands = mapOpenCodeCommands([{ name: "review", description: "Review" }]);
    const turnContext = "[client context] tab_id: 7";

    /** The runtime's provider text for a handle that does not place context itself. */
    async function submit(prompt: string) {
      const { client, session } = clientFixture();
      const text = structuredTurnTextOptions(
        { structuredSession: {}, slashCommands: commands },
        { prompt, turnContext },
      );
      const payload = buildOpenCodePromptPayload(
        prompt,
        undefined,
        { kind: "posix", path: "/repo" },
        text.inlineInstructions,
      );
      await submitOpenCodePrompt(client, "s", payload, commands);
      return session;
    }

    it("still runs the native compact", async () => {
      const session = await submit("/compact");
      expect(session.compact).toHaveBeenCalledWith({ sessionID: "s" });
      expect(session.command).not.toHaveBeenCalled();
      expect(session.prompt).not.toHaveBeenCalled();
    });

    it("passes only the user's arguments to a registered command", async () => {
      const session = await submit("/review src/a.ts");
      expect(session.command).toHaveBeenCalledWith({
        sessionID: "s",
        name: "review",
        text: "src/a.ts",
      });
    });

    it("keeps the context on ordinary prompts and unknown slash text", async () => {
      for (const prompt of ["what is on this page?", "/unknown arguments"]) {
        const session = await submit(prompt);
        expect(session.prompt).toHaveBeenCalledWith({
          sessionID: "s",
          text: `${prompt}\n\n${turnContext}`,
        });
      }
    });
  });
});
