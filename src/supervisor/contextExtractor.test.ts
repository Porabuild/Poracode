import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { ModelSelection } from "@/shared/selectionBinding.schemas.ts";

const effects = vi.hoisted(() => ({
  spawn: vi.fn<() => Promise<string>>(async () => "summary"),
  spec: vi.fn<
    (
      _location: unknown,
      command: string,
      args: string[],
    ) => Promise<{ command: string; args: string[] }>
  >(async (_location, command, args) => ({
    command,
    args,
  })),
}));
vi.mock("./oneShotSpawn", () => ({
  spawnAgent: effects.spawn,
  buildOneShotSpec: effects.spec,
  prepareOneShot: vi.fn<() => never>(() => {
    throw new Error("unexpected spawn preparation");
  }),
}));
vi.mock("./agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agents/base")>()),
  resolveAgentProjectLocation: async (location: ProjectLocation) => location,
}));

import {
  assertOneShotControlsMapped,
  resolveCheckedOneShotResumeSelection,
  UnsupportedOneShotControlError,
  type AgentAdapter,
} from "./agents/base";
import { extractContext, extractContextFromScrollback } from "./contextExtractor";

const location: ProjectLocation = { kind: "posix", path: "/review/mock-workspace" };
const sessionRef = {
  providerSessionId: "review-session",
  discoveredAt: "2026-10-09T00:00:00.000Z",
};

beforeEach(() => {
  effects.spawn.mockClear();
  effects.spec.mockClear();
});

function fixtureAdapter(): AgentAdapter {
  return {
    kind: "fixture",
    label: "Fixture",
    buildContextExtractionCommand(_sessionRef, _location, model, options) {
      const selection = resolveCheckedOneShotResumeSelection(model, options);
      assertOneShotControlsMapped(selection, {
        effort: { inactive: [""] },
        fast: { inactive: [false] },
      });
      return { command: "fixture", args: [selection.model] };
    },
  } as AgentAdapter;
}

function bindingFor(model: string): NonNullable<ModelSelection["selectionBinding"]> {
  return {
    version: 1,
    kind: "family-member",
    owner: { agentKind: "fixture", presentationMode: "terminal" },
    model,
    inertValues: { effort: "", fast: false },
  };
}

describe("extractContext resume lane", () => {
  it("passes the full selection as argument 4 and keeps the model its checked projection", async () => {
    const adapter = fixtureAdapter();
    adapter.buildContextExtractionCommand = (_sessionRef, _location, model, options) => {
      const selection = resolveCheckedOneShotResumeSelection(model, options);
      return { command: "fixture", args: [JSON.stringify(selection)] };
    };
    const builder = vi.spyOn(adapter, "buildContextExtractionCommand");
    const selection: ModelSelection = {
      model: "fixture-model",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
      selectionBinding: bindingFor("fixture-model"),
    };

    await expect(
      extractContext(location, adapter, sessionRef, undefined, selection),
    ).resolves.toMatchObject({ summary: "summary", sourceProvider: "fixture" });

    expect(builder).toHaveBeenCalledExactlyOnceWith(sessionRef, location, "fixture-model", {
      selection,
    });
    // The binding rides the options object verbatim — never lost between the
    // generator and the resume builder.
    const options = builder.mock.calls[0]?.[3];
    expect(options?.selection?.selectionBinding).toBe(selection.selectionBinding);
    expect(effects.spec).toHaveBeenCalledExactlyOnceWith(
      location,
      "fixture",
      [JSON.stringify(selection)],
      { markOutput: true },
    );
    expect(effects.spawn).toHaveBeenCalledOnce();
  });

  it("refuses unsupported meaningful controls on the resume lane with zero effects", async () => {
    const adapter = fixtureAdapter();
    const selection: ModelSelection = {
      model: "fixture-model",
      effort: "high",
      fast: true,
      thinking: true,
      contextSize: "1m",
      selectionBinding: bindingFor("fixture-model"),
    };

    const outcome = await extractContext(location, adapter, sessionRef, undefined, selection).then(
      () => "extracted",
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(UnsupportedOneShotControlError);
    expect((outcome as UnsupportedOneShotControlError).axes).toEqual([
      "effort",
      "fast",
      "thinking",
      "contextSize",
    ]);
    // Visible refusal, zero effects: no command spec is built and nothing
    // spawns, and the scrollback fallback never gets a chance to run with a
    // reduced tuple.
    expect(effects.spec).not.toHaveBeenCalled();
    expect(effects.spawn).not.toHaveBeenCalled();
  });

  it("keeps the legacy direct call unstamped and reaching the spawn", async () => {
    const adapter = fixtureAdapter();
    await expect(extractContext(location, adapter, sessionRef)).resolves.toMatchObject({
      summary: "summary",
    });
    expect(effects.spawn).toHaveBeenCalledOnce();
  });
});

describe("extractContextFromScrollback fallback lane", () => {
  it("carries the complete selection and binding into the one-shot runner", async () => {
    const runOneShot = vi
      .fn<NonNullable<AgentAdapter["runOneShot"]>>()
      .mockResolvedValue("fallback summary");
    const adapter: AgentAdapter = { ...fixtureAdapter(), defaultOneShotModel: "m", runOneShot };
    const selection: ModelSelection = {
      model: "m",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "default",
      selectionBinding: bindingFor("m"),
    };

    await expect(
      extractContextFromScrollback(
        location,
        adapter,
        "terminal scrollback",
        "fixture",
        "review-session",
        undefined,
        selection,
      ),
    ).resolves.toMatchObject({ summary: "fallback summary" });

    expect(runOneShot).toHaveBeenCalledOnce();
    const input = runOneShot.mock.calls[0]?.[0]!;
    expect(input.selection).toEqual(selection);
    expect(input.selection.selectionBinding).toBe(selection.selectionBinding);
  });
});
