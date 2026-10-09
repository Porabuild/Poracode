// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Project, RemoteThreadCommand, StartThreadPayload, Thread } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import type { AppThreadLauncherDeps, CreateAppThreadRequest } from "./appThreadLauncher";
import { createAppThread } from "./appThreadLauncher";

const project: Project = {
  id: "p1",
  name: "Alpha",
  location: { kind: "posix", path: "/work/alpha" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const binding = {
  version: 1 as const,
  kind: "family-member" as const,
  owner: { agentKind: "vendor:profile", presentationMode: "gui" as const },
  model: "member-1",
  inertValues: { effort: "" },
};

const fullSelectionRequest: CreateAppThreadRequest = {
  projectId: project.id,
  prompt: "Fix the failing check.",
  agentKind: "vendor:profile",
  model: "member-1",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "32k",
  selectionBinding: binding,
  title: "Fix PR",
};

function setup(overrides: Partial<AppThreadLauncherDeps> = {}): {
  deps: AppThreadLauncherDeps;
  threads: Map<string, Thread>;
  commands: RemoteThreadCommand[];
  startPayloads: StartThreadPayload[];
  events: string[];
} {
  const events: string[] = [];
  const threads = new Map<string, Thread>();
  const commands: RemoteThreadCommand[] = [];
  const startPayloads: StartThreadPayload[] = [];
  const deps: AppThreadLauncherDeps = {
    startThread: async (payload) => {
      events.push("startThread");
      startPayloads.push(payload);
    },
    getAgentStatuses: async () => ({ fromCache: true, windows: [], wsl: [] }),
    addWorktree: async ({ branch }) => {
      events.push("addWorktree");
      return { path: `/work/alpha/.worktrees/${branch}` };
    },
    removeWorktree: async ({ path }) => {
      events.push(`removeWorktree:${path}`);
    },
    sendThreadCommand: (command) => {
      commands.push(command);
      return true;
    },
    ensureHomeProject: () => {
      events.push("ensureHomeProject");
      return project;
    },
    getProject: (projectId) => (projectId === project.id ? project : null),
    getSharedSettings: () => defaultSharedSettings,
    upsertThread: (thread) => {
      events.push("upsertThread");
      threads.set(thread.id, thread);
    },
    deleteThread: (threadId) => {
      events.push("deleteThread");
      threads.delete(threadId);
    },
    threadExists: () => false,
    ...overrides,
  };
  return { deps, threads, commands, startPayloads, events };
}

describe("createAppThread execution scope fields", () => {
  const wsl: Project = {
    ...project,
    location: {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/work/alpha",
      uncPath: "\\\\wsl$\\Ubuntu\\work\\alpha",
    },
  };
  const remote: Project = {
    ...project,
    remoteServerId: "host-a",
    location: { kind: "posix", path: "/work/alpha", remoteServerId: "host-a" },
  };
  const cases: Array<{ name: string; before: Project; after: Project }> = [
    {
      name: "WSL UNC",
      before: wsl,
      after: {
        ...wsl,
        location: {
          ...wsl.location,
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/work/alpha",
          uncPath: "\\\\other\\alpha",
        },
      },
    },
    {
      name: "location remote tag hidden by the project remote tag",
      before: remote,
      after: { ...remote, location: { ...remote.location, remoteServerId: "host-b" } },
    },
    { name: "project remote tag", before: remote, after: { ...remote, remoteServerId: "host-b" } },
    {
      name: "normalized Windows spelling",
      before: { ...project, location: { kind: "windows", path: "C:\\Alpha" } },
      after: { ...project, location: { kind: "windows", path: "C:\\ALPHA" } },
    },
  ];

  it.each(cases)(
    "refuses a changed $name after permission resolution",
    async ({ before, after }) => {
      const entered = Promise.withResolvers<void>();
      const held = Promise.withResolvers<void>();
      let current = before;
      const { deps, events, threads, commands } = setup({
        getProject: () => current,
        getAgentStatuses: async () => {
          entered.resolve();
          await held.promise;
          return { fromCache: false, windows: [], wsl: [] };
        },
      });
      const launch = createAppThread(deps, fullSelectionRequest);
      await entered.promise;
      current = after;
      held.resolve();
      await expect(launch).rejects.toThrow("moved or was removed");
      expect(events).toEqual([]);
      expect(threads.size).toBe(0);
      expect(commands).toEqual([]);
    },
  );
});

describe("createAppThread selection carriage", () => {
  it("carries the complete selection into the thread row and launch payload", async () => {
    const { deps, threads, startPayloads } = setup();

    const result = await createAppThread(deps, fullSelectionRequest);

    const thread = threads.get(result.threadId);
    expect(thread?.config).toEqual({
      model: "member-1",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "32k",
      selectionBinding: binding,
    });
    expect(thread?.agentKind).toBe("vendor:profile");
    expect(startPayloads[0]?.config).toEqual(thread?.config);
    expect(startPayloads[0]?.presentationMode).toBe("gui");
  });

  it("keeps omitted selection carriers absent while empty and false values stay exact", async () => {
    const bare = setup();
    const bareResult = await createAppThread(bare.deps, {
      projectId: project.id,
      prompt: "Fix it.",
      agentKind: "codex",
      model: "m-1",
      title: "T",
    });
    const bareConfig = bare.threads.get(bareResult.threadId)?.config;
    expect(bareConfig).toEqual({ model: "m-1" });
    for (const axis of ["effort", "fast", "thinking", "contextSize", "selectionBinding"] as const) {
      expect(axis in bareConfig!).toBe(false);
    }

    const exact = setup();
    const exactResult = await createAppThread(exact.deps, {
      projectId: project.id,
      prompt: "Fix it.",
      agentKind: "codex",
      model: "m-1",
      effort: "",
      fast: false,
      title: "T",
    });
    const exactConfig = exact.threads.get(exactResult.threadId)?.config;
    expect(exactConfig?.effort).toBe("");
    expect(exactConfig?.fast).toBe(false);
    expect("effort" in exactConfig!).toBe(true);
    expect("fast" in exactConfig!).toBe(true);
    expect("thinking" in exactConfig!).toBe(false);
  });
});

describe("createAppThread launch admission", () => {
  it("invokes the gate before effects and after the worktree, permission, and title awaits", async () => {
    const { deps, events } = setup();
    const gate = () => events.push("admit");

    await createAppThread(
      deps,
      // A slash-command prompt forces the awaited title lookup; a worktree
      // request forces the awaited worktree creation.
      (() => {
        const { title: _omitted, ...withoutTitle } = fullSelectionRequest;
        return { ...withoutTitle, prompt: "/goal ship it", worktree: {} };
      })(),
      { admitLaunch: gate },
    );

    expect(events).toEqual([
      "admit",
      "addWorktree",
      "admit",
      "admit",
      "admit",
      "upsertThread",
      "startThread",
    ]);
  });

  it("refuses before any effect when the gate throws at entry", async () => {
    const { deps, threads, commands, events } = setup();

    await expect(
      createAppThread(deps, fullSelectionRequest, {
        admitLaunch: () => {
          throw new Error("refused");
        },
      }),
    ).rejects.toThrow("refused");

    expect(events).toEqual([]);
    expect(threads.size).toBe(0);
    expect(commands).toEqual([]);
  });

  it("rolls the created worktree back when the gate refuses after it", async () => {
    const { deps, threads, commands, events } = setup();
    let calls = 0;

    await expect(
      createAppThread(
        deps,
        { ...fullSelectionRequest, worktree: { branch: "pr-42" } },
        {
          admitLaunch: () => {
            calls += 1;
            if (calls > 1) throw new Error("refused-after-worktree");
          },
        },
      ),
    ).rejects.toThrow("refused-after-worktree");

    // The gate ran at entry and again after the awaited worktree creation,
    // where the refusal triggers the rollback of the created checkout.
    expect(calls).toBe(2);
    expect(events).toEqual(["addWorktree", "removeWorktree:/work/alpha/.worktrees/pr-42"]);
    expect(threads.size).toBe(0);
    expect(commands).toEqual([]);
  });

  it("keeps the launch rollback when the supervisor start fails", async () => {
    const { deps, threads, commands, events } = setup({
      startThread: async () => {
        events.push("startThread");
        throw new Error("supervisor down");
      },
    });

    await expect(
      createAppThread(deps, { ...fullSelectionRequest, worktree: { branch: "pr-42" } }),
    ).rejects.toThrow("supervisor down");

    expect(events).toEqual([
      "addWorktree",
      "upsertThread",
      "startThread",
      "deleteThread",
      "removeWorktree:/work/alpha/.worktrees/pr-42",
    ]);
    expect(threads.size).toBe(0);
    expect(commands.map((command) => command.kind)).toEqual(["start", "delete"]);
  });

  it("keeps a pre-existing row when the start fails", async () => {
    const { deps, threads, commands } = setup({
      threadExists: () => true,
      startThread: async () => {
        throw new Error("supervisor down");
      },
    });

    await expect(createAppThread(deps, fullSelectionRequest)).rejects.toThrow("supervisor down");

    // A pre-existing row is never deleted by the rollback.
    expect(threads.size).toBe(1);
    expect(commands.map((command) => command.kind)).toEqual(["start"]);
  });

  it("launches existing callers unchanged without admission options", async () => {
    const { deps, events } = setup();

    await createAppThread(deps, {
      projectId: project.id,
      prompt: "Fix it.",
      agentKind: "codex",
      model: "m-1",
      title: "T",
    });

    expect(events).toEqual(["upsertThread", "startThread"]);
  });
});

describe("createAppThread entry selection validation", () => {
  const invalidSelections: Array<[string, Record<string, unknown>]> = [
    ["empty model", { model: "" }],
    ["non-string model", { model: 42 }],
    ["mistyped effort", { effort: 3 }],
    ["mistyped fast", { fast: "yes" }],
    ["mistyped thinking", { thinking: 1 }],
    ["mistyped contextSize", { contextSize: 7 }],
    ["future binding version", { selectionBinding: { ...binding, version: 200 } }],
    ["unknown binding key", { selectionBinding: { ...binding, temperature: 1 } }],
    ["empty binding record", { selectionBinding: { version: 1, kind: "family-member" } }],
  ];

  it.each(invalidSelections)(
    "refuses %s before any effect, with or without admission options",
    async (_name, override) => {
      const withGate = setup();
      await expect(
        createAppThread(withGate.deps, {
          ...fullSelectionRequest,
          ...override,
        } as unknown as CreateAppThreadRequest),
      ).rejects.toThrow("unsupported selection data");
      expect(withGate.events).toEqual([]);
      expect(withGate.threads.size).toBe(0);
      expect(withGate.commands).toEqual([]);

      const withoutGate = setup();
      await expect(
        createAppThread(withoutGate.deps, {
          ...fullSelectionRequest,
          ...override,
        } as unknown as CreateAppThreadRequest),
      ).rejects.toThrow("unsupported selection data");
      expect(withoutGate.events).toEqual([]);
      expect(withoutGate.threads.size).toBe(0);
    },
  );

  it("keeps own empty and false carriers exact on the validated launch", async () => {
    const { deps, threads, startPayloads } = setup();

    const result = await createAppThread(deps, fullSelectionRequest);

    const config = threads.get(result.threadId)?.config;
    expect(config?.effort).toBe("");
    expect(config?.fast).toBe(false);
    expect(config?.thinking).toBe(false);
    expect(config?.contextSize).toBe("32k");
    expect(config?.selectionBinding).toEqual(binding);
    expect(startPayloads[0]?.config).toEqual(config);
  });
});

describe("createAppThread project scope", () => {
  const movedProject: Project = {
    ...project,
    location: { kind: "posix", path: "/work/alpha-moved" },
  };

  it("refuses with a rollback when the project relocates across a held permission await", async () => {
    const held = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    let relocated = false;
    const { deps, threads, commands, events } = setup({
      getProject: (projectId) => {
        if (projectId !== project.id) return null;
        return relocated ? movedProject : project;
      },
      getAgentStatuses: async () => {
        entered.resolve();
        await held.promise;
        return { fromCache: true, windows: [], wsl: [] };
      },
    });

    const launching = createAppThread(deps, { ...fullSelectionRequest, worktree: {} });
    await entered.promise;
    relocated = true;
    held.resolve();
    await expect(launching).rejects.toThrow("moved or was removed");

    // The created checkout is rolled back and nothing was persisted or spawned.
    expect(events).toEqual([
      "addWorktree",
      expect.stringContaining("removeWorktree:/work/alpha/.worktrees/"),
    ]);
    expect(threads.size).toBe(0);
    expect(commands).toEqual([]);
  });

  it("refuses before persistence when the project relocates across a held title await", async () => {
    const held = Promise.withResolvers<void>();
    let statusCalls = 0;
    let relocated = false;
    const { deps, threads, commands, events } = setup({
      getProject: (projectId) => {
        if (projectId !== project.id) return null;
        return relocated ? movedProject : project;
      },
      getAgentStatuses: async () => {
        statusCalls += 1;
        // First call: the permission seam resolves; second call: the title
        // lookup is held so the relocation lands between it and persistence.
        if (statusCalls === 1) return { fromCache: true, windows: [], wsl: [] };
        await held.promise;
        return { fromCache: true, windows: [], wsl: [] };
      },
    });
    const { title: _omitted, ...withoutTitle } = fullSelectionRequest;

    const launching = createAppThread(deps, {
      ...withoutTitle,
      prompt: "/goal ship it",
    });
    await vi.waitFor(() => expect(statusCalls).toBe(2));
    relocated = true;
    held.resolve();
    await expect(launching).rejects.toThrow("moved or was removed");

    // The post-title scope check fired before the row was persisted.
    expect(events).not.toContain("upsertThread");
    expect(threads.size).toBe(0);
    expect(commands).toEqual([]);
  });
});
