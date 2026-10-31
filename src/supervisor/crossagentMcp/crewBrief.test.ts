import { describe, expect, it, vi } from "vitest";
import type { ThreadCrewBinding } from "@/shared/crew";
import {
  crewChangedBriefText,
  crewEditingRoleIds,
  crewLeadEditNudgeText,
  crewLeadMidTurnNudgeText,
  crewPlaybookText,
  crewSetBriefText,
} from "./crewBrief";
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

type RoleShape = { noEdits?: true; parallel?: number };
const shaped = (roles: Record<string, RoleShape>): ThreadCrewBinding => ({
  version: 1,
  policy: "crew-only",
  roles: Object.entries(roles).map(([id, shape]) => ({
    id,
    label: id,
    selection: { agentKind: "codex", model: "gpt-6-luna" },
    ...shape,
  })),
});
const playbookLines = (binding: ThreadCrewBinding) => crewPlaybookText(binding).split("\n");

it("keeps delegation inside the crew and tunes brief detail to each helper's model", () => {
  const text = crewPlaybookText(
    crew({ builder: "gpt-6-luna", reviewer: "haiku", architect: "claude-opus-5-5" }),
  );
  expect(text).toContain(
    "- Delegate only through spawn_agent, as the crew policy allows. Do not use your own built-in subagent or task tools.",
  );
  expect(text).toContain(
    "- builder and reviewer run smaller models: give prescriptive tasks (exact files, interfaces and test cases), specify the code rather than describing it, and do not leave alternatives for them to pick. Let them gather the code your plan needs, then settle the plan yourself.",
  );
  expect(text).toContain(
    "- architect runs a frontier model: give the goal and constraints, let it explore and fill in the details, and take its pushback seriously.",
  );
  expect(text).toContain("Pass fresh_session=true only for unrelated work.");
});

it("leaves code-level briefing out when every helper runs a frontier model", () => {
  const text = crewPlaybookText(crew({ architect: "claude-opus-5-5" }));
  expect(text).toContain(
    "- Settle consequential choices before you hand off: the exact interfaces, the exact tests and what done means. Point at files instead of pasting their content.",
  );
  expect(text).toContain("- architect runs a frontier model:");
  expect(text).not.toMatch(/specify the code|alternatives for/iu);
});

it("delegates implementation and verification by default and reviews instead of re-editing", () => {
  expect(crewPlaybookText(crew({ sidekick: "gpt-6-luna" }))).toBe(
    [
      "How to work with the crew:",
      "- Delegate only through spawn_agent, as the crew policy allows. Do not use your own built-in subagent or task tools.",
      "- Delegate the hands-on work by default, including implementation and its verification (builds, linters, type checks, tests, app smoke runs and screenshots). Do a step yourself only when you can make the edit and confirm it in one or two of your own turns, or when it is correctness-critical work whose authoring and checking you must own.",
      "- Have helpers run manual QA and capture screenshots, and return their paths; view only the screenshots you need for your verdict.",
      "- A helper turn costs a fraction of yours: handing off implementation and verification saves most of a change's cost, and quality holds because you design the change and review the result.",
      "- Keep planning, design decisions, talking to the user, reviewing results, and commits and pull requests yourself.",
      "- Hand broad code searches (finding files, callers, tests) to a role that fits; the helper locates code, it does not review or audit it. Read only what you need to decide, and treat a helper's hypothesis as unconfirmed until you have checked its evidence.",
      "- Settle consequential choices before you hand off: the exact interfaces, the exact tests and what done means. Point at files instead of pasting their content.",
      "- sidekick runs a smaller model: give prescriptive tasks (exact files, interfaces and test cases), specify the code rather than describing it, and do not leave alternatives for it to pick. Let it gather the code your plan needs, then settle the plan yourself.",
      "- sidekick runs one task at a time: combine or queue work for it instead of spawning another copy; a second spawn while one runs is refused.",
      "- In a brief, name the narrowest checks that cover the change, with at most one full gate at the end.",
      "- You do not need to load a skill to delegate; these rules cover it.",
      "- Wait with wait_for_agent instead of polling get_status.",
      "- Spawning the same role again continues its helper's previous session, so it keeps its context: a follow-up only needs what changed, not the earlier brief. Pass fresh_session=true only for unrelated work. Use steer_agent to correct a helper that is still running.",
      "- When a helper reports, read the full diff and give a verdict before your next step, then send all rework in one follow-up. Do not redo work it reported as done, and do not re-edit files it changed: send the fix back instead, unless it is a trivial one-turn fix.",
    ].join("\n"),
  );
});

it("lists the roles that may edit in role order", () => {
  expect(
    crewEditingRoleIds(
      shaped({ scout: { noEdits: true }, fixer: {}, reviewer: { noEdits: true }, builder: {} }),
    ),
  ).toEqual(["fixer", "builder"]);
  expect(crewEditingRoleIds(shaped({ reviewer: { noEdits: true } }))).toEqual([]);
});

it("points the edit nudge at the roles that may edit", () => {
  expect(crewLeadEditNudgeText(shaped({ sidekick: {} }))).toBe(
    "[crew] Last turn you edited files yourself instead of handing the work to your crew. Hand implementation and its verification to spawn_agent role=sidekick; edit directly only for one- or two-turn fixes.",
  );
  expect(crewLeadMidTurnNudgeText(shaped({ sidekick: {} }))).toBe(
    "[crew] You just edited files yourself instead of handing the work to your crew. Hand implementation and its verification to spawn_agent role=sidekick; edit directly only for one- or two-turn fixes.",
  );
  const mixed = shaped({ builder: {}, reviewer: { noEdits: true }, tester: {} });
  expect(crewLeadEditNudgeText(mixed)).toContain("spawn_agent role=<id> (builder, tester);");
  expect(crewLeadMidTurnNudgeText(mixed)).toContain("spawn_agent role=<id> (builder, tester);");
  const readOnly = shaped({ reviewer: { noEdits: true } });
  expect(crewLeadEditNudgeText(readOnly)).toBeUndefined();
  expect(crewLeadMidTurnNudgeText(readOnly)).toBeUndefined();
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

it("names a role's context length in the crew brief", () => {
  const binding = crew({ builder: "gpt-6-luna" });
  const withContext: ThreadCrewBinding = {
    ...binding,
    roles: binding.roles.map((role) => ({
      ...role,
      selection: { ...role.selection, contextSize: "1m" },
    })),
  };
  expect(crewSetBriefText(withContext)).toContain(
    "- builder (builder): codex/gpt-6-luna, 1m context.",
  );
});

describe("crew composition lines", () => {
  it("routes no-edit findings to the editing roles and chains read-only and editing roles", () => {
    const lines = playbookLines(
      shaped({ scout: { noEdits: true }, builder: {}, reviewer: { noEdits: true } }),
    );
    expect(lines).toContain(
      "- scout and reviewer are told not to edit: send their findings to builder as one rework task instead of fixing them yourself.",
    );
    expect(lines).toContain(
      "- Use each role for the work its description names, and chain them: let read-only roles search or review, and editing roles implement and fix.",
    );
    expect(lines).toContain(
      "- Delegate the hands-on work by default, including implementation and its verification (builds, linters, type checks, tests, app smoke runs and screenshots). Do a step yourself only when you can make the edit and confirm it in one or two of your own turns, or when it is correctness-critical work whose authoring and checking you must own.",
    );
  });

  it("joins several editing roles with or for a single no-edit role", () => {
    expect(
      playbookLines(shaped({ reviewer: { noEdits: true }, builder: {}, fixer: {} })),
    ).toContain(
      "- reviewer is told not to edit: send its findings to builder or fixer as one rework task instead of fixing them yourself.",
    );
  });

  it("has the lead make the edits when every role is told not to edit", () => {
    const lines = playbookLines(shaped({ scout: { noEdits: true, parallel: 2 } }));
    expect(lines).toContain(
      "- Every role is told not to edit: use the crew for searching, investigation and review, and make the edits yourself.",
    );
    expect(lines).toContain(
      "- Delegate the hands-on work the crew can do by default: searching, investigation, review and verification (builds, linters, type checks, tests, app smoke runs and screenshots).",
    );
    // Manual QA edits nothing, so no-edit roles still run it.
    expect(lines).toContain(
      "- Have helpers run manual QA and capture screenshots, and return their paths; view only the screenshots you need for your verdict.",
    );
    expect(lines).toContain(
      "- A helper turn costs a fraction of yours: handing off searching, review and verification saves much of a change's cost, and quality holds because you make the edits and check each helper's evidence.",
    );
    expect(lines).toContain(
      "- When a helper reports, check its evidence and give a verdict before your next step, then send all follow-ups in one message. Do not redo work it reported as done.",
    );
    const text = lines.join("\n");
    expect(text).not.toContain("including implementation and its verification");
    expect(text).not.toContain("handing off implementation");
    expect(text).not.toContain("re-edit");
    expect(text).not.toContain("full diff");
    expect(text).not.toContain("send its findings");
  });

  it("splits work across a role that may run several copies at once", () => {
    const lines = playbookLines(shaped({ builder: { parallel: 3 } }));
    expect(lines).toContain(
      "- builder can run up to 3 at once: split independent work into separate tasks, spawn them with background=true, then wait for each.",
    );
    expect(lines.join("\n")).not.toContain("one task at a time");
    expect(
      playbookLines(shaped({ builder: { parallel: 3 }, scout: { noEdits: true, parallel: 2 } })),
    ).toContain(
      "- builder can run up to 3 and scout up to 2 at once: split independent work into separate tasks, spawn them with background=true, then wait for each.",
    );
  });

  it("queues work for one-at-a-time roles instead of spawning another copy", () => {
    const lines = playbookLines(
      shaped({ reviewer: { noEdits: true, parallel: 2 }, sidekick: {}, tester: { parallel: 1 } }),
    );
    expect(lines).toContain(
      "- sidekick and tester run one task at a time: combine or queue work for them instead of spawning another copy; a second spawn while one runs is refused.",
    );
    expect(lines).toContain(
      "- reviewer can run up to 2 at once: split independent work into separate tasks, spawn them with background=true, then wait for each.",
    );
  });

  it("adds no routing line for a single role beyond its concurrency", () => {
    const lines = playbookLines(shaped({ sidekick: {} }));
    expect(lines).toContain(
      "- sidekick runs one task at a time: combine or queue work for it instead of spawning another copy; a second spawn while one runs is refused.",
    );
    expect(lines.join("\n")).not.toMatch(/told not to edit|Use each role|at once:/u);
  });

  it("names each role's work without chaining when no role is read-only", () => {
    const lines = playbookLines(shaped({ tester: {}, builder: {} }));
    expect(lines).toContain("- Use each role for the work its description names.");
    expect(lines.join("\n")).not.toContain("chain them");
  });

  it("repeats the composition lines, not the playbook, after a roster change", () => {
    const binding = shaped({ reviewer: { noEdits: true, parallel: 2 }, sidekick: {} });
    expect(crewChangedBriefText({ ...binding, name: "Review board" })).toBe(
      [
        '[crew] The user changed this thread\'s crew. It is now "Review board" (Crew only). Crew only: spawns without a role are refused.',
        "Roles:",
        "- reviewer (reviewer, up to 2 at once): codex/gpt-6-luna. Told not to edit files.",
        "- sidekick (sidekick): codex/gpt-6-luna.",
        "Working with this crew:",
        "- reviewer is told not to edit: send its findings to sidekick as one rework task instead of fixing them yourself.",
        "- reviewer can run up to 2 at once: split independent work into separate tasks, spawn them with background=true, then wait for each.",
        "- sidekick runs one task at a time: combine or queue work for it instead of spawning another copy; a second spawn while one runs is refused.",
        "- Use each role for the work its description names, and chain them: let read-only roles search or review, and editing roles implement and fix.",
      ].join("\n"),
    );
    expect(crewChangedBriefText(binding)).not.toContain("How to work with the crew");
  });
});
