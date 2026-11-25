import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk/unstable";
import {
  createAcpMapperState,
  mapAcpPermissionRequest,
  mapAcpSessionUpdate,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping";
import {
  createGeminiAcpSessionTransform,
  GEMINI_MODE_UPDATE_PREFIX,
  normalizeGeminiPermissionRequest,
} from "./acpTransform";

describe("createGeminiAcpSessionTransform", () => {
  it("downgrades [MODE_UPDATE] text chunks (including leading whitespace) to session_info_update", () => {
    const transform = createGeminiAcpSessionTransform();

    expect(
      transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `${GEMINI_MODE_UPDATE_PREFIX} Mode changed to yolo`,
          },
        },
      }),
    ).toEqual({
      sessionId: "s-1",
      update: {
        sessionUpdate: "session_info_update",
      },
    });

    expect(
      transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: " \n  [MODE_UPDATE] autoEdit enabled",
          },
        },
      }).update,
    ).toEqual({
      sessionUpdate: "session_info_update",
    });

    const textNotification: SessionNotification = {
      sessionId: "s-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Microservices improve deployment independence.",
        },
      },
    };
    const thoughtNotification: SessionNotification = {
      sessionId: "s-1",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: "[MODE_UPDATE] thinking",
        },
      },
    };
    expect(transform(textNotification)).toBe(textNotification);
    expect(transform(thoughtNotification)).toBe(thoughtNotification);
  });

  it("maps Gemini write_todos description items via canonical ACP mapping", () => {
    const transform = createGeminiAcpSessionTransform();
    const state = createAcpMapperState("gemini-todos");

    const notification = transform({
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "write_todos-1700-1",
        title: "Set 3 todo(s)",
        kind: "other",
        status: "in_progress",
        rawInput: {
          todos: [
            { description: "Audit transport", status: "completed" },
            { description: "Wire plan preview", status: "in_progress" },
            { status: "pending" },
          ],
        },
      },
    });

    const events = mapAcpSessionUpdate(notification, state);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "plan",
        payload: {
          steps: [
            { step: "Audit transport", status: "completed" },
            { step: "Wire plan preview", status: "in_progress" },
            { step: "Task", status: "pending" },
          ],
        },
      }),
    );

    const summaryOnlyNotification: SessionNotification = {
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "write_todos-1700-2",
        title: "Set 2 todo(s)",
        kind: "other",
        status: "in_progress",
      },
    };
    expect(transform(summaryOnlyNotification)).toBe(summaryOnlyNotification);
  });

  it("normalizes Gemini LocalSubagentInvocation calls into canonical task subagent items", () => {
    const transform = createGeminiAcpSessionTransform();
    const state = createAcpMapperState("gemini-subagent");

    const started = transform({
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "codebase_investigator-1700-1",
        title:
          "Running subagent 'codebase_investigator' with inputs: { objective: Inspect auth flow, scope: src/auth }",
        kind: "think",
        status: "in_progress",
      },
    });

    const startedUpdate = started.update as Record<string, unknown>;
    expect(startedUpdate.title).toBe("Inspect auth flow");
    expect(startedUpdate.rawInput).toMatchObject({
      _toolName: "task",
      subagent_type: "codebase_investigator",
      description: "Inspect auth flow",
      prompt: "Inspect auth flow",
      objective: "Inspect auth flow",
      scope: "src/auth",
    });
    expect(
      (startedUpdate._meta as Record<string, unknown>)?.[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY],
    ).toBe(true);

    const startedEvents = mapAcpSessionUpdate(started, state);
    expect(startedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "tool_call",
        payload: expect.objectContaining({
          name: "Inspect auth flow",
          isSubAgent: true,
          status: "running",
          args: expect.objectContaining({
            _toolName: "task",
            subagent_type: "codebase_investigator",
          }),
        }),
      }),
    );

    // Follow-up completion update may omit the Running subagent title, yet must
    // stay normalized using the tracked coordinator entry and forget on terminal status.
    const completed = transform({
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "codebase_investigator-1700-1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "Auth flow summary" } }],
      },
    });
    const completedUpdate = completed.update as Record<string, unknown>;
    expect(completedUpdate.title).toBe("Inspect auth flow");
    expect(completedUpdate.rawInput).toMatchObject({
      _toolName: "task",
      subagent_type: "codebase_investigator",
      description: "Inspect auth flow",
    });

    const completedEvents = mapAcpSessionUpdate(completed, state);
    expect(completedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({
          isSubAgent: true,
          status: "success",
          result: "Auth flow summary",
        }),
      }),
    );
  });

  it("normalizes Gemini DelegateInvocation ('Delegating to agent') calls into canonical task subagent items", () => {
    const transform = createGeminiAcpSessionTransform();
    const state = createAcpMapperState("gemini-delegate-subagent");

    const started = transform({
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "codebase_investigator-1700-2",
        title: "Delegating to agent 'codebase_investigator'",
        kind: "think",
        status: "in_progress",
      },
    });

    const startedUpdate = started.update as Record<string, unknown>;
    expect(startedUpdate.title).toBe("codebase_investigator");
    expect(startedUpdate.rawInput).toMatchObject({
      _toolName: "task",
      subagent_type: "codebase_investigator",
    });
    expect(
      (startedUpdate._meta as Record<string, unknown>)?.[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY],
    ).toBe(true);

    const startedEvents = mapAcpSessionUpdate(started, state);
    expect(startedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "tool_call",
        payload: expect.objectContaining({
          name: "codebase_investigator",
          isSubAgent: true,
          status: "running",
          args: expect.objectContaining({
            _toolName: "task",
            subagent_type: "codebase_investigator",
          }),
        }),
      }),
    );

    const completed = transform({
      sessionId: "s-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "codebase_investigator-1700-2",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "greet, farewell" } }],
      },
    });
    const completedEvents = mapAcpSessionUpdate(completed, state);
    expect(completedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({
          isSubAgent: true,
          status: "success",
          result: "greet, farewell",
        }),
      }),
    );
  });

  it("normalizes EnterPlanMode and ExitPlanMode updates and loads plan markdown from disk", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gemini-plan-transform-"));
    try {
      mkdirSync(join(projectDir, "plans"), { recursive: true });
      writeFileSync(
        join(projectDir, "plans", "feature.md"),
        "# Feature Plan\n\n- Step 1\n",
        "utf8",
      );

      const transform = createGeminiAcpSessionTransform({
        projectLocation: { kind: "posix", path: projectDir },
      });

      const enterStart = transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "enter_plan_mode-1700-1",
          title: "Initiating Plan Mode",
          kind: "other",
          status: "in_progress",
        },
      });
      expect((enterStart.update as Record<string, unknown>).title).toBe("EnterPlanMode");

      const enterDone = transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "enter_plan_mode-1700-1",
          status: "completed",
        },
      });
      expect((enterDone.update as Record<string, unknown>).title).toBe("EnterPlanMode");

      const exitStart = transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "exit_plan_mode-1700-2",
          title: "Requesting plan approval for: plans/feature.md",
          kind: "other",
          status: "in_progress",
        },
      });
      const exitUpdate = exitStart.update as Record<string, unknown>;
      expect(exitUpdate.title).toBe("ExitPlanMode");
      expect(exitUpdate.locations).toEqual([{ path: "plans/feature.md" }]);
      expect(exitUpdate.rawInput).toEqual({
        planFilePath: "plans/feature.md",
        plan: "# Feature Plan\n\n- Step 1",
      });

      const exitDone = transform({
        sessionId: "s-1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "exit_plan_mode-1700-2",
          status: "completed",
        },
      });
      expect((exitDone.update as Record<string, unknown>).title).toBe("ExitPlanMode");
      expect((exitDone.update as Record<string, unknown>).rawInput).toEqual({
        planFilePath: "plans/feature.md",
        plan: "# Feature Plan\n\n- Step 1",
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe("normalizeGeminiPermissionRequest", () => {
  it("normalizes Gemini exit_plan_mode approval requests into ExitPlanMode plan reviews", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gemini-plan-perm-"));
    try {
      mkdirSync(join(projectDir, "plans"), { recursive: true });
      writeFileSync(join(projectDir, "plans", "rollout.md"), "# Rollout\n\n1. Ship it\n", "utf8");

      const rawRequest: RequestPermissionRequest = {
        sessionId: "s-1",
        toolCall: {
          toolCallId: "exit_plan_mode-1700-3",
          title: "Requesting plan approval for: plans/rollout.md",
          kind: "other",
          status: "pending",
        },
        options: [
          { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
          { optionId: "cancel", name: "Cancel", kind: "reject_once" },
        ],
      };

      const normalized = normalizeGeminiPermissionRequest(rawRequest, {
        projectLocation: { kind: "posix", path: projectDir },
      });
      expect(normalized.toolCall.title).toBe("ExitPlanMode");
      expect(normalized.toolCall.locations).toEqual([{ path: "plans/rollout.md" }]);
      expect(normalized.toolCall.rawInput).toEqual({
        planFilePath: "plans/rollout.md",
        plan: "# Rollout\n\n1. Ship it",
      });

      const state = createAcpMapperState("gemini-plan-thread");
      const mapped = mapAcpPermissionRequest(normalized, state, "req-1");
      expect(mapped).toMatchObject({
        type: "request.opened",
        threadId: "gemini-plan-thread",
        requestId: "req-1",
        requestType: "tool_call_approval",
        payload: {
          details: {
            toolName: "ExitPlanMode",
            input: {
              plan: "# Rollout\n\n1. Ship it",
              planFilePath: "plans/rollout.md",
            },
          },
        },
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("reads Gemini exit_plan_mode plans stored under ~/.gemini/tmp outside the project root", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gemini-plan-proj-"));
    const geminiDirExisted = existsSync(join(homedir(), ".gemini"));
    const geminiTmpExisted = existsSync(join(homedir(), ".gemini", "tmp"));
    const slugDir = join(homedir(), ".gemini", "tmp", `vitest-gemini-plan-${process.pid}`);
    const planFile = join(slugDir, "plans", "add-ping.md");
    try {
      mkdirSync(join(slugDir, "plans"), { recursive: true });
      writeFileSync(planFile, "# Plan\n\n1. Add ping()\n", "utf8");

      const rawRequest: RequestPermissionRequest = {
        sessionId: "s-1",
        toolCall: {
          toolCallId: "exit_plan_mode-1700-4",
          title: `Requesting plan approval for: ${planFile}`,
          kind: "other",
          status: "pending",
        },
        options: [
          { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
          { optionId: "cancel", name: "Cancel", kind: "reject_once" },
        ],
      };

      const normalized = normalizeGeminiPermissionRequest(rawRequest, {
        projectLocation: { kind: "posix", path: projectDir },
      });
      const state = createAcpMapperState("gemini-home-plan");
      const mapped = mapAcpPermissionRequest(normalized, state, "req-2");
      expect(mapped).toMatchObject({
        type: "request.opened",
        threadId: "gemini-home-plan",
        requestId: "req-2",
        payload: {
          details: {
            toolName: "ExitPlanMode",
            input: {
              plan: "# Plan\n\n1. Add ping()",
              planFilePath: planFile,
            },
          },
        },
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(slugDir, { recursive: true, force: true });
      if (!geminiTmpExisted)
        rmSync(join(homedir(), ".gemini", "tmp"), { recursive: true, force: true });
      if (!geminiDirExisted) rmSync(join(homedir(), ".gemini"), { recursive: true, force: true });
    }
  });

  it("reads Gemini exit_plan_mode plans from an active profile's profileConfigDir", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gemini-plan-proj-prof-"));
    const profileHome = mkdtempSync(join(tmpdir(), "gemini-plan-profhome-"));
    const profileConfigDir = join(profileHome, ".gemini");
    const planFile = join(profileConfigDir, "tmp", "slug-1", "plans", "profile-plan.md");
    try {
      mkdirSync(join(profileConfigDir, "tmp", "slug-1", "plans"), { recursive: true });
      writeFileSync(planFile, "# Profile Plan\n\n1. Isolated\n", "utf8");

      const rawRequest: RequestPermissionRequest = {
        sessionId: "s-1",
        toolCall: {
          toolCallId: "exit_plan_mode-1700-6",
          title: `Requesting plan approval for: ${planFile}`,
          kind: "other",
          status: "pending",
        },
        options: [{ optionId: "proceed_once", name: "Allow", kind: "allow_once" }],
      };

      const normalized = normalizeGeminiPermissionRequest(rawRequest, {
        projectLocation: { kind: "posix", path: projectDir },
        profileConfigDir,
      });
      expect(normalized.toolCall.rawInput).toEqual({
        planFilePath: planFile,
        plan: "# Profile Plan\n\n1. Isolated",
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(profileHome, { recursive: true, force: true });
    }
  });

  it("refuses to read arbitrary files outside the project or symlinks escaping approved roots", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "gemini-plan-proj-sec-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "gemini-plan-outside-"));
    const outsidePlan = join(outsideDir, "secret.md");
    const symlinkedPlan = join(projectDir, "plans", "escape.md");
    try {
      writeFileSync(outsidePlan, "SECRET_SHOULD_NOT_LEAK", "utf8");
      mkdirSync(join(projectDir, "plans"), { recursive: true });
      symlinkSync(outsidePlan, symlinkedPlan);

      const directRequest: RequestPermissionRequest = {
        sessionId: "s-1",
        toolCall: {
          toolCallId: "exit_plan_mode-1700-5",
          title: `Requesting plan approval for: ${outsidePlan}`,
          kind: "other",
          status: "pending",
        },
        options: [{ optionId: "proceed_once", name: "Allow", kind: "allow_once" }],
      };
      const normalizedDirect = normalizeGeminiPermissionRequest(directRequest, {
        projectLocation: { kind: "posix", path: projectDir },
      });
      expect(normalizedDirect.toolCall.rawInput).toEqual({ planFilePath: outsidePlan });

      const symlinkRequest: RequestPermissionRequest = {
        sessionId: "s-1",
        toolCall: {
          toolCallId: "exit_plan_mode-1700-7",
          title: "Requesting plan approval for: plans/escape.md",
          kind: "other",
          status: "pending",
        },
        options: [{ optionId: "proceed_once", name: "Allow", kind: "allow_once" }],
      };
      const normalizedSymlink = normalizeGeminiPermissionRequest(symlinkRequest, {
        projectLocation: { kind: "posix", path: projectDir },
      });
      expect(normalizedSymlink.toolCall.rawInput).toEqual({ planFilePath: "plans/escape.md" });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("leaves regular tool permission requests untouched", () => {
    const request: RequestPermissionRequest = {
      sessionId: "s-1",
      toolCall: {
        toolCallId: "run_shell_command-1700-1",
        title: "pwd",
        kind: "execute",
        status: "pending",
      },
      options: [{ optionId: "proceed_once", name: "Allow", kind: "allow_once" }],
    };

    expect(normalizeGeminiPermissionRequest(request)).toBe(request);
  });
});
