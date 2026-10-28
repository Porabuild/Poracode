import { expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import { crewPlaybookText } from "./crewBrief";
import { flush, makeHarness, PARENT } from "./testHarness";

const crew = (models: Record<string, string>): ThreadCrewBinding => ({
  version: 1,
  policy: "crew-only",
  roles: Object.entries(models).map(([id, model]) => ({
    id,
    label: id,
    selection: { agentKind: "codex", model },
  })),
});

it("keeps delegation inside the crew and tunes brief detail to each helper's model", () => {
  const text = crewPlaybookText(
    crew({ builder: "gpt-6-luna", reviewer: "haiku", architect: "claude-opus-5-5" }),
  );
  expect(text).toContain(
    "- Delegate only to the crew through spawn_agent. Do not use your own built-in subagent or task tools.",
  );
  expect(text).toContain(
    "- builder and reviewer run smaller models: give prescriptive tasks (exact files, interfaces and test cases), and do the exploration that shapes your plan yourself.",
  );
  expect(text).toContain(
    "- architect runs a frontier model: give the goal and constraints, let it explore and fill in the details, and take its pushback seriously.",
  );
  expect(text).toContain("pass fresh_session=true only for unrelated work");
});

it("omits the frontier line when every helper runs a smaller model", () => {
  const text = crewPlaybookText(crew({ builder: "gpt-6-luna" }));
  expect(text).toContain("- builder runs a smaller model:");
  expect(text).not.toContain("frontier model");
});

it("lets a frontier helper push back and tells every helper to work alone", async () => {
  const h = makeHarness({ models: [{ id: "gpt-5.5-pro", label: "GPT-5.5 Pro" }] });
  h.manager.spawn(PARENT, {
    agent: "codex",
    model: "gpt-5.5-pro",
    prompt: "Design the cache",
    crewRole: { id: "architect", label: "Architect", parallel: 1 },
  });
  await vi.waitFor(() => expect(h.handles[0]?.startTurns).toHaveLength(1));
  const prompt = h.handles[0]!.startTurns[0]!.prompt;
  expect(prompt).toContain(
    "Do this work yourself: do not start subagents, including your own built-in subagent or task tools, and do not hand it to other agents.",
  );
  expect(prompt).toContain(
    "If the task looks wrong or incomplete, say so and suggest a fix before implementing.",
  );
  expect(prompt).not.toContain("Follow the task as written");
  h.manager.cancelAllForThread(PARENT);
  await flush();
});
