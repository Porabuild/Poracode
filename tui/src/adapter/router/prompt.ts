import { Buffer } from "node:buffer";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { SessionPromptOutput } from "@opencode/client";
import { isThreadSessionAbsenceRefusal } from "@/shared/threadSessionRefusal";
import { DEFAULT_TERMINAL_SIZE, isThreadTurnActive, type ThreadConfig } from "@/shared/contracts";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import {
  handoffContextInstruction,
  readThreadToolEnabled,
  resolveProviderHandoffStrategy,
  targetGuaranteesReadThreadTool,
} from "@/shared/providerHandoff";
import { resolveComposerMcpScope } from "@/shared/contracts/agent";
import { resolveNewThreadMcpConfig } from "@/shared/contracts/mcpServer";
import { resolveProjectLocation } from "@/shared/worktree";
import { logAdapterError } from "../diagnostics";
import { itemId, messageId, threadId } from "../ids";
import { selectPermissionOption } from "../permissions";
import { record } from "./helpers";
import type { RouterContext } from "./context";

/** The /api/session/:id/prompt path — new threads, resume, fork, side-chat. */
export function createPrompt(ctx: RouterContext) {
  const {
    input,
    sessions,
    states,
    pending,
    createdWorktrees,
    pendingSwitches,
    threadMentionTools,
    shellStash,
    sessionMcpPending,
    threadCache,
    commitPendingRevert,
    captureFileCheckpoint,
    followUpDelivery,
    remoteSettings,
    autoTitle,
    resolveDefaultModel,
    resolveProject,
    persistLastModel,
    agentStatuses,
    directoryOf,
    listThreads,
    pendingRequestKey,
    pendingRequestsForSession,
  } = ctx;
  const sendPrompt = async (session: string, body: Record<string, unknown>) => {
    const currentProject = await resolveProject();
    const raw = sessions.get(session);
    const id = raw?.threadId ?? threadId(session);
    // A staged /undo commits before the next prompt — send paths that skipped
    // revert.commit land here.
    const revertError = await commitPendingRevert(session);
    if (revertError) return revertError;
    const model = record(body.model);
    const agentID = String(body.agent ?? raw?.agentID ?? "build");
    const providerID = String(
      model.providerID ?? raw?.providerID ?? (await resolveDefaultModel())?.providerID ?? "",
    );
    const selectedModel = String(
      model.id ?? raw?.model ?? body.modelID ?? (await resolveDefaultModel())?.model ?? "",
    );
    const effort = String(model.variant ?? raw?.effort ?? body.effort ?? "");
    const promptPartsSchema = z.array(z.record(z.string(), z.unknown()));
    const messageParts = promptPartsSchema.safeParse(record(body.message).parts);
    const bodyParts = promptPartsSchema.safeParse(body.parts);
    const promptParts = messageParts.success
      ? messageParts.data
      : bodyParts.success
        ? bodyParts.data
        : [];
    const text =
      typeof body.text === "string"
        ? body.text
        : promptParts
            .filter((part) => record(part).type === "text")
            .map((part) => String(record(part).text ?? ""))
            .join("");
    const message = record(body.message);
    const userMessageItemId = itemId(
      String(message.id ?? body.messageID ?? body.id ?? crypto.randomUUID()),
    );
    const selectedStatus = (await agentStatuses()).find((status) => status.kind === providerID);
    if (!selectedStatus || !selectedModel)
      return {
        status: 400,
        error: { code: "invalid_request", message: "Choose an installed provider and model" },
      };
    ctx.activeProviderID = providerID;
    const guiCapabilities =
      selectedStatus.capabilities.presentationCapabilities?.gui ?? selectedStatus.capabilities;
    // Files arrive as {uri} entries: `data:` URIs are pasted/inline files
    // uploaded to the host, `file:` URIs are @file mentions that become
    // project-relative file segments (desktop serializeMentions shape).
    const mentionSchema = z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      text: z.string(),
    });
    const attachmentSchema = z.object({
      uri: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
      mention: mentionSchema.optional(),
    });
    const attachments = z.array(attachmentSchema).safeParse(body.files ?? body.attachments);
    const MAX_ATTACHMENTS = 8;
    const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
    type FileSegment =
      | { kind: "attachment"; path: string; mimeType: string }
      | { kind: "file"; path: string };
    const parsedFiles: { segment: FileSegment; mention?: z.infer<typeof mentionSchema> }[] = [];
    // Prompt-attached skills — {id:"scope:name", mention:{start,end}} — become
    // skill segments at their mention offsets, removed from the flat prompt.
    const skillRefs = z
      .array(z.object({ id: z.string(), mention: mentionSchema.optional() }))
      .safeParse(body.skills);
    const parsedSkills: {
      segment: {
        kind: "skill";
        name: string;
        provider: string;
        scope: "global" | "project";
        invocation: string;
        path?: string;
        pluginId?: string;
      };
      mention?: z.infer<typeof mentionSchema>;
    }[] = [];
    if (skillRefs.success && skillRefs.data.length > 0) {
      const skillProject = await resolveProject();
      const scanned = await input.client
        .callRemoteProcedure("scanSkills", { projectLocation: skillProject.location })
        .catch(() => null);
      const skillRows = record(scanned).plugins;
      const available = (Array.isArray(skillRows) ? skillRows : []).map((value) => {
        const entry = record(value);
        const name = String(entry.name ?? "");
        const scope = String(entry.scope ?? "project");
        return {
          id: scope + ":" + name,
          name,
          provider: String(entry.provider ?? ""),
          scope,
          invocation: String(entry.invocation ?? entry.name ?? name),
          ...(typeof entry.path === "string" ? { path: entry.path } : {}),
          ...(typeof entry.pluginId === "string" ? { pluginId: entry.pluginId } : {}),
        };
      });
      for (const ref of skillRefs.data) {
        const skill = available.find((value) => value.id === ref.id);
        if (!skill)
          return {
            status: 400,
            error: { code: "invalid_request", message: "Unknown skill " + ref.id + "." },
          };
        parsedSkills.push({
          segment: {
            kind: "skill",
            name: skill.name,
            provider: skill.provider,
            scope: skill.scope === "global" ? "global" : "project",
            invocation: skill.invocation,
            ...(skill.path ? { path: skill.path } : {}),
            ...(skill.pluginId ? { pluginId: skill.pluginId } : {}),
          },
          ...(ref.mention ? { mention: ref.mention } : {}),
        });
      }
    }
    if (body.files !== undefined && !attachments.success)
      return { error: { code: "invalid_request", message: "Malformed files entry" }, status: 400 };
    if (attachments.success && attachments.data.length > 0) {
      if (attachments.data.length > MAX_ATTACHMENTS)
        return {
          error: {
            code: "invalid_request",
            message: `Too many attachments (max ${MAX_ATTACHMENTS})`,
          },
          status: 400,
        };
      const acceptsImages = selectedStatus.capabilities.readsImageAttachmentsFromHost !== false;
      const projectDir = directoryOf(currentProject.location);
      for (const file of attachments.data) {
        const uri = file.uri;
        if (uri.startsWith("data:")) {
          const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/u.exec(uri);
          if (!match)
            return {
              error: { code: "invalid_request", message: "Malformed data: attachment URI" },
              status: 400,
            };
          const mime = match[1] || "application/octet-stream";
          if (match[2] === undefined)
            return {
              error: {
                code: "invalid_request",
                message: "Only base64-encoded data: URIs are supported",
              },
              status: 400,
            };
          const bytes = Buffer.from(match[3] ?? "", "base64");
          if (bytes.length > MAX_ATTACHMENT_BYTES)
            return {
              error: {
                code: "invalid_request",
                message: `Attachment ${file.name ?? "file"} exceeds ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`,
              },
              status: 400,
            };
          if (mime.startsWith("image/") && !acceptsImages)
            return {
              error: {
                code: "invalid_request",
                message: "This provider does not accept image attachments",
              },
              status: 400,
            };
          const uploaded = await input.client.uploadAttachment({
            threadId: id,
            fileName: file.name ?? (mime.startsWith("image/") ? "Image.png" : "file"),
            data: bytes,
          });
          parsedFiles.push({
            segment: { kind: "attachment", path: uploaded, mimeType: mime },
            ...(file.mention ? { mention: file.mention } : {}),
          });
          continue;
        }
        if (uri.startsWith("file:")) {
          let filePath: string;
          try {
            filePath = fileURLToPath(uri);
          } catch {
            return {
              error: { code: "invalid_request", message: `Malformed file: URI ${uri}` },
              status: 400,
            };
          }
          const relativePath = relative(projectDir, filePath).replaceAll("\\", "/");
          // Inside the project it becomes a file-mention segment; outside, the
          // mention text already in the prompt carries the reference.
          if (relativePath !== "" && !relativePath.startsWith("../") && relativePath !== "..")
            parsedFiles.push({
              segment: { kind: "file", path: relativePath },
              ...(file.mention ? { mention: file.mention } : {}),
            });
          continue;
        }
        return {
          error: {
            code: "invalid_request",
            message: `Unsupported attachment URI scheme: ${uri.split(":", 1)[0]}`,
          },
          status: 400,
        };
      }
    }
    // Ordered segments: the host consumes segments instead of the flat text
    // when any are present, so the text has to be woven back in around each
    // mention (desktop serializes chips in prompt order). Files without a
    // mention lead; empty text chunks are dropped. The flat prompt drops only
    // attachment-mention placeholders — @file mention text stays.
    const segments: Array<
      | FileSegment
      | { kind: "text"; content: string }
      | {
          kind: "skill";
          name: string;
          provider: string;
          scope: "global" | "project";
          invocation: string;
          path?: string;
          pluginId?: string;
        }
    > = [];
    let promptText = text;
    if (parsedFiles.length > 0 || parsedSkills.length > 0) {
      for (const file of parsedFiles.filter((entry) => !entry.mention)) segments.push(file.segment);
      for (const skill of parsedSkills.filter((entry) => !entry.mention))
        segments.push(skill.segment);
      const mentioned: {
        segment: FileSegment | (typeof parsedSkills)[number]["segment"];
        mention: z.infer<typeof mentionSchema>;
      }[] = [...parsedFiles, ...parsedSkills].filter(
        (entry): entry is typeof entry & { mention: z.infer<typeof mentionSchema> } =>
          entry.mention !== undefined,
      );
      mentioned.sort((left, right) => left.mention.start - right.mention.start);
      let cursor = 0;
      for (const entry of mentioned) {
        const before = text.slice(cursor, entry.mention.start);
        if (before.trim().length > 0) segments.push({ kind: "text", content: before });
        segments.push(entry.segment);
        cursor = entry.mention.end;
      }
      const tail = text.slice(cursor);
      if (tail.trim().length > 0) segments.push({ kind: "text", content: tail });
      promptText = mentioned
        .filter((entry) => entry.segment.kind === "attachment" || entry.segment.kind === "skill")
        .sort((left, right) => right.mention.start - left.mention.start)
        .reduce(
          (value, entry) => value.slice(0, entry.mention.start) + value.slice(entry.mention.end),
          text,
        )
        .replace(/\s+/g, " ")
        .trim();
    }
    // `!command` output becomes one-shot model context — prepended to the
    // final prompt and segments, once, AFTER the mention rewrite.
    const stashedShell = shellStash.get(session);
    if (stashedShell?.length) {
      const preamble = stashedShell
        .map(
          (entry) =>
            `Shell output the user ran before this message:\n$ ${entry.command}\n${entry.output}`,
        )
        .join("\n\n");
      segments.unshift({ kind: "text", content: `${preamble}\n\n` });
      promptText = `${preamble}\n\n${promptText}`;
      shellStash.delete(session);
    }
    const mode = agentID === "plan" ? "plan" : "agent";
    input.registerThreadContext(id, {
      agent: agentID,
      providerID,
      model: selectedModel,
      location: { directory: directoryOf(currentProject.location) },
    });
    await input.setThreadInterests([id]);
    // Cache-first: the route's visibility gate already refreshed the list
    // when this request needed it; only miss when nothing has listed yet.
    const remoteThread =
      threadCache.get(id) ?? (await listThreads()).find((value) => value.id === id);
    const savedConfigMatches = raw?.providerID === providerID && raw.model === selectedModel;
    const remoteConfigMatches =
      remoteThread?.agentKind === providerID && remoteThread.config.model === selectedModel;
    // Same-provider threads keep their host config (executionEnvironment,
    // MCP/tool overrides, reviewer, importedFrom) — only the fields the TUI
    // owns are overlaid. A model change drops the stale selectionBinding; a
    // different provider starts from an empty base.
    const sameProvider = remoteThread?.agentKind === providerID;
    const base: ThreadConfig | Record<string, never> =
      remoteThread && sameProvider ? remoteThread.config : {};
    const modelChanged = "model" in base && base.model !== selectedModel;
    const { selectionBinding: _droppedBinding, ...baseRest } = base as ThreadConfig;
    const config: ThreadConfig = {
      ...(modelChanged ? baseRest : base),
      model: selectedModel,
      ...(effort ? { effort } : {}),
      ...(savedConfigMatches && raw?.fast !== undefined ? { fast: raw.fast } : {}),
      ...(savedConfigMatches && raw?.thinking !== undefined ? { thinking: raw.thinking } : {}),
      ...(savedConfigMatches && raw?.contextSize ? { contextSize: raw.contextSize } : {}),
      mode,
      approvalPolicy:
        (savedConfigMatches ? raw.approvalPolicy : undefined) ??
        (remoteConfigMatches ? remoteThread?.config.approvalPolicy : undefined) ??
        guiCapabilities.defaultApprovalPolicy ??
        selectedStatus.capabilities.defaultApprovalPolicy,
      sandboxMode:
        (savedConfigMatches ? raw.sandboxMode : undefined) ??
        (remoteConfigMatches ? remoteThread?.config.sandboxMode : undefined) ??
        guiCapabilities.defaultSandboxMode ??
        selectedStatus.capabilities.defaultSandboxMode,
    };
    let switchedProvider = false;
    // Per-session MCP toggles apply at launch — overlay the pending flags
    // and clear them so they fire exactly once per thread start.
    const pendingMcp = sessionMcpPending.get(session) ?? sessionMcpPending.get("");
    if (pendingMcp) {
      const target = config as Record<string, unknown>;
      for (const [server, enabled] of pendingMcp) {
        const field =
          server === "crossagents"
            ? "crossagentMcp"
            : server === "browser"
              ? "browserMcp"
              : server === "chrome"
                ? "chromeMcp"
                : undefined;
        if (field) target[field] = enabled;
        else {
          const overrides = record(target.mcpServerOverrides);
          overrides[server] = enabled;
          target.mcpServerOverrides = overrides;
        }
      }
    }
    const pendingSwitch = pendingSwitches.get(session);
    if (pendingSwitch && remoteThread) {
      // In-place provider switch: relaunch this thread under the target
      // provider — no sessionRef, no ensureRunning.
      const targetStatus = (await agentStatuses()).find(
        (value) => value.kind === pendingSwitch.providerID,
      );
      if (!targetStatus)
        return {
          error: {
            code: "unsupported",
            message: `Provider ${pendingSwitch.providerID} is not installed.`,
          },
          status: 400,
        };
      const switchConfig: ThreadConfig = { ...config };
      const remoteConfig = record(remoteThread.config);
      if (resolveComposerMcpScope(targetStatus.capabilities.mcpScope, "gui") !== "none") {
        for (const key of [
          "crossagentMcp",
          "browserMcp",
          "chromeMcp",
          "mcpServerOverrides",
          "pluginOverrides",
        ])
          if (remoteConfig[key] !== undefined)
            (switchConfig as Record<string, unknown>)[key] = remoteConfig[key];
      }
      // Pending MCP toggles apply after the remote-config carry-over, or the
      // switch silently drops them.
      if (pendingMcp) {
        const target = switchConfig as Record<string, unknown>;
        for (const [server, enabled] of pendingMcp) {
          const field =
            server === "crossagents"
              ? "crossagentMcp"
              : server === "browser"
                ? "browserMcp"
                : server === "chrome"
                  ? "chromeMcp"
                  : undefined;
          if (field) target[field] = enabled;
          else {
            const overrides = record(target.mcpServerOverrides);
            overrides[server] = enabled;
            target.mcpServerOverrides = overrides;
          }
        }
      }
      const switchSettings = await remoteSettings();
      const switchContextStrategy = resolveProviderHandoffStrategy({
        sourcePresentationMode: "gui",
        targetPresentationMode: "gui",
        isMirroredThread: false,
        readThreadToolEnabled: readThreadToolEnabled({
          disabledBuiltInMcpServers: record(switchSettings.disabledBuiltInMcpServers) as never,
          disabledBuiltInMcpTools: record(switchSettings.disabledBuiltInMcpTools) as never,
        }),
        threadResolvedReadThreadTool: threadMentionTools.get(id) === true,
        targetReadThreadToolGuaranteed: targetGuaranteesReadThreadTool(
          targetStatus.capabilities,
          "gui",
        ),
      });
      let switchPrompt = promptText;
      let switchSegments = segments;
      if (switchContextStrategy === "context-file" && remoteThread.sessionRef) {
        const extracted = record(
          await input.client.callRemoteProcedure("extractContext", {
            threadId: id,
            agentKind: remoteThread.agentKind,
            sessionRef: remoteThread.sessionRef,
            projectLocation: resolveProjectLocation(
              currentProject.location,
              remoteThread.worktreePath,
            ),
            ...(remoteThread.worktreePath ? { worktreePath: remoteThread.worktreePath } : {}),
          }),
        );
        const instruction = handoffContextInstruction(
          extracted as unknown as Parameters<typeof handoffContextInstruction>[0],
        );
        const uploaded = await input.client.uploadAttachment({
          threadId: id,
          fileName: "handoff-context.md",
          data: new TextEncoder().encode(String(extracted.summary ?? "")),
        });
        switchPrompt = `${instruction}\n\n${promptText}`;
        switchSegments = [
          { kind: "text", content: `${instruction}\n\n` },
          { kind: "attachment", path: uploaded, mimeType: "text/markdown" },
          { kind: "text", content: "\n\n" },
          ...(segments.length > 0 ? segments : [{ kind: "text" as const, content: promptText }]),
        ];
      }
      const switchRequest = {
        threadId: id,
        projectLocation: resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
        agentKind: pendingSwitch.providerID,
        config: switchConfig,
        prompt: switchPrompt,
        ...(switchSegments.length > 0 ? { segments: switchSegments } : {}),
        ...(userMessageItemId ? { userMessageItemId } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
        providerSwitch: {
          fromAgentKind: remoteThread.agentKind,
          handoffItemId: `handoff-${crypto.randomUUID()}`,
          contextStrategy: switchContextStrategy,
        },
      } satisfies Parameters<RemoteDesktopClient["startThread"]>[0];
      try {
        await captureFileCheckpoint(id, userMessageItemId, switchRequest.projectLocation);
        await input.client.startThread(switchRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
      } catch (error) {
        // The pending switch stays — the next prompt retries it.
        const status = (error as { status?: unknown }).status === 409 ? 409 : 500;
        return {
          error: {
            code: status === 409 ? "conflict" : "internal_error",
            message: error instanceof Error ? error.message : "The provider switch failed.",
          },
          status,
        };
      }
      pendingSwitches.delete(session);
      switchedProvider = true;
      input.registerThreadContext(id, {
        agent: config.mode === "plan" ? "plan" : "build",
        providerID: pendingSwitch.providerID,
        model: pendingSwitch.modelID,
        location: {
          directory: directoryOf(
            resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
          ),
        },
      });
    }
    const status = states.get(id);
    if (!switchedProvider && status && isThreadTurnActive(status)) {
      // Delivery: the prompt body's explicit choice wins, then the remote
      // followUpBehavior setting, default steer.
      const delivery =
        body.delivery === "steer" || body.delivery === "queue"
          ? body.delivery
          : await followUpDelivery();
      if (delivery === "queue") {
        try {
          await input.client.callRemoteProcedure("queueThreadFollowUp", {
            threadId: id,
            prompt: promptText,
            config,
            ...(segments.length > 0 ? { segments } : {}),
          });
        } catch (error) {
          if (error instanceof RemoteClientError)
            return {
              error: {
                code: "unsupported",
                message: "This Poracode host can't queue follow-ups.",
              },
              status: 501,
            };
          throw error;
        }
      } else {
        // Desktop parity: decline an open approval before steering so the
        // agent is not left waiting on an answer it cannot get. Form and
        // elicitation requests are not approvals — leave them alone.
        for (const request of await pendingRequestsForSession(session)) {
          if (request.requestType === "tool_user_input") continue;
          const optionId = selectPermissionOption(request.options, "reject");
          if (!optionId) continue;
          try {
            await input.client.resolveRequest({
              threadId: id,
              requestId: request.requestId,
              method: "requestPermission",
              response: { optionId },
            });
          } catch {
            /* the approval may have resolved concurrently */
          }
          input.recordPermissionReply(id, request.requestId, "reject");
          pending.delete(pendingRequestKey(id, request.requestId));
        }
        await input.client.setPendingSteer({
          threadId: id,
          prompt: promptText,
          config,
          ...(segments.length > 0 ? { segments } : {}),
        });
      }
    } else if (remoteThread && !switchedProvider) {
      const sendRequest = {
        threadId: id,
        prompt: promptText,
        config,
        userMessageItemId,
        ...(segments.length > 0 ? { segments } : {}),
      };
      try {
        // File checkpoints are captured by the sending client — checkpointRevert's
        // files phase needs one per turn's base user message.
        await captureFileCheckpoint(
          id,
          userMessageItemId,
          resolveProjectLocation(currentProject.location, remoteThread.worktreePath),
        );
        await input.client.sendThreadInput(sendRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
      } catch (error) {
        await logAdapterError({
          home: input.bootstrap.home,
          method: "POST",
          route: `/api/session/${session}/prompt`,
          input: { hostRequest: sendRequest },
          error,
        });
        if (
          !(error instanceof RemoteClientError) ||
          error.status !== 422 ||
          error.requestMayHaveCommitted !== false ||
          !isThreadSessionAbsenceRefusal(error)
        )
          throw error;
        const latestThread = (await listThreads()).find((value) => value.id === id);
        if (!latestThread)
          throw new Error(
            "This thread can no longer be resumed because it no longer exists on the host.",
            { cause: error },
          );
        if (!latestThread.sessionRef && !latestThread.canResumeWithConfig)
          throw new Error(
            "This thread cannot be resumed because the host has no session reference or resumable configuration.",
            { cause: error },
          );
        const resumeProject =
          latestThread.projectId === currentProject.id
            ? currentProject
            : (
                await input.client.boundedProjectListPage({ mode: "inventory", projectLimit: 100 })
              ).projects.find((value) => value.id === latestThread.projectId);
        if (!resumeProject)
          throw new Error(
            "This thread cannot be resumed because its project location is unavailable.",
            { cause: error },
          );
        const resumeLocation = resolveProjectLocation(
          resumeProject.location,
          latestThread.worktreePath,
        );
        input.registerThreadContext(id, {
          agent: latestThread.config.mode === "plan" ? "plan" : "build",
          providerID: latestThread.agentKind,
          model: latestThread.config.model,
          location: { directory: directoryOf(resumeLocation) },
        });
        const resumeRequest = {
          threadId: id,
          projectLocation: resumeLocation,
          agentKind: latestThread.agentKind,
          ...(latestThread.agentInstanceId
            ? { agentInstanceId: latestThread.agentInstanceId }
            : {}),
          config: latestThread.config,
          prompt: promptText,
          ...(userMessageItemId ? { userMessageItemId } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
          ...(latestThread.sessionRef ? { sessionRef: latestThread.sessionRef } : {}),
          ...(latestThread.presentationMode
            ? { presentationMode: latestThread.presentationMode }
            : {}),
        } satisfies Parameters<RemoteDesktopClient["startThread"]>[0];
        try {
          await captureFileCheckpoint(id, userMessageItemId, resumeRequest.projectLocation);
          await input.client.startThread(resumeRequest);
          sessionMcpPending.delete(session);
          sessionMcpPending.delete("");
        } catch (resumeError) {
          await logAdapterError({
            home: input.bootstrap.home,
            method: "POST",
            route: `/api/session/${session}/prompt`,
            input: { hostRequest: resumeRequest, operation: "resume" },
            error: resumeError,
          });
          throw resumeError;
        }
      }
    } else if (!switchedProvider) {
      // Fresh threads get the desktop's standing MCP defaults (Crossagents on
      // by default). No mentions and no implicit client tools.
      const startConfig: ThreadConfig = { ...config };
      const startSettings = await remoteSettings();
      const mcpSettings = record(startSettings.enabledMcpServers);
      const disabledBuiltIn = record(startSettings.disabledBuiltInMcpServers);
      if (Object.keys(mcpSettings).length > 0 || Object.keys(disabledBuiltIn).length > 0) {
        Object.assign(
          startConfig,
          resolveNewThreadMcpConfig(
            {
              enabledMcpServers: mcpSettings as Record<string, boolean>,
              disabledBuiltInMcpServers: disabledBuiltIn as never,
            },
            selectedStatus.capabilities,
            "gui",
            currentProject.location,
          ),
        );
      }
      const startWorktreePath = raw?.worktreePath;
      const startIsNewWorktree = startWorktreePath
        ? createdWorktrees.delete(startWorktreePath)
        : undefined;
      const startRequest = {
        threadId: id,
        projectId: currentProject.id,
        agentKind: providerID,
        config: startConfig,
        prompt: promptText,
        userMessageItemId,
        presentationMode: "gui",
        ...(startWorktreePath ? { worktreePath: startWorktreePath } : {}),
        ...(raw?.worktreeBranch ? { worktreeBranch: raw.worktreeBranch } : {}),
        ...(startIsNewWorktree ? { isNewWorktree: true } : {}),
      } satisfies Parameters<RemoteDesktopClient["startNewThread"]>[0];
      try {
        await captureFileCheckpoint(
          id,
          userMessageItemId,
          resolveProjectLocation(currentProject.location, startRequest.worktreePath),
        );
        await input.client.startNewThread(startRequest);
        sessionMcpPending.delete(session);
        sessionMcpPending.delete("");
        autoTitle(id, text, currentProject);
      } catch (error) {
        await logAdapterError({
          home: input.bootstrap.home,
          method: "POST",
          route: `/api/session/${session}/prompt`,
          input: { hostRequest: startRequest },
          error,
        });
        throw error;
      }
    }
    sessions.set(session, {
      ...raw,
      threadId: id,
      projectId: currentProject.id,
      createdAt: raw?.createdAt ?? Date.now(),
      remoteStarted: true,
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandboxMode: config.sandboxMode } : {}),
    });
    await persistLastModel({
      provider: providerID,
      model: selectedModel,
      ...(config.effort ? { effort: config.effort } : {}),
      ...(config.approvalPolicy ? { approvalPolicy: config.approvalPolicy } : {}),
      ...(config.sandboxMode ? { sandboxMode: config.sandboxMode } : {}),
    });
    const output: SessionPromptOutput = {
      id: messageId(userMessageItemId),
      sessionID: session,
      time: { created: Date.now() },
      type: "user",
      payload: { text, files: [], skills: [] },
      delivery: "steer",
    };
    return { data: output };
  };

  return { sendPrompt };
}
