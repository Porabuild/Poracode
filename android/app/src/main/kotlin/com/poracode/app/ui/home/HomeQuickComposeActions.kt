package com.poracode.app.ui.home

import com.poracode.app.chat.RichPromptSegment
import com.poracode.app.chat.toJsonArrayOrNull
import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.GitMutationOutcome
import com.poracode.app.model.GitOperationRequest
import com.poracode.app.model.GitRequests
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.asObjectOrNull
import com.poracode.app.model.stringOrNull
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.protocol.git.GitProcedure
import com.poracode.app.session.projects.GitExecutionResult
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.threads.ThreadOperationResult
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.ui.richchat.RichChatUiLogic
import com.poracode.app.ui.richchat.UploadedAttachment
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

internal fun launchHomeQuickCompose(
    scope: CoroutineScope,
    runtime: ThreadSessionRuntime,
    project: RemoteProject,
    threadId: String,
    defaults: HomeThreadLaunchDefaults?,
    selectedAgent: AgentStatusEntry?,
    catalog: HomeQuickComposeCatalog?,
    configuration: ThreadConfig,
    prompt: String,
    presentationMode: ThreadPresentationMode,
    worktree: HomeQuickComposeWorktree?,
    skill: RichPromptSegment.Skill?,
    mentionSegments: List<RichPromptSegment> = emptyList(),
    attachments: List<UploadedAttachment>,
    onFailure: () -> Unit,
    onStarted: (String) -> Unit,
) {
    val launchAgentKind = selectedAgent?.kind ?: defaults?.agentKind ?: return
    val launchConfiguration = catalog?.normalize(configuration)
        ?: configuration.copy(model = configuration.model.ifBlank { "default" })
    val text = prompt.trim()
    if (text.isEmpty()) return
    val segments = JsonArray(
        skill?.let { listOf(it).toJsonArrayOrNull()?.toList().orEmpty() }.orEmpty() +
            mentionSegments.toJsonArrayOrNull()?.toList().orEmpty() +
            RichChatUiLogic.attachmentSegments(attachments)?.toList().orEmpty(),
    ).takeIf { it.isNotEmpty() }
    scope.launch {
        val result = runtime.controller.execute(
            ThreadLifecycleCommand.Start(
                threadId = threadId,
                projectId = project.id,
                agentKind = launchAgentKind,
                agentInstanceId = if (launchAgentKind == defaults?.agentKind) {
                    defaults?.agentInstanceId
                } else {
                    null
                },
                config = launchConfiguration,
                prompt = text,
                commandId = ThreadCommandId(UUID.randomUUID().toString()),
                segments = segments,
                presentationMode = presentationMode,
                worktreePath = worktree?.path,
                worktreeBranch = worktree?.branch,
                isNewWorktree = worktree?.path?.let { worktree.isNew },
                focus = true,
            ),
        )
        when (result) {
            is ThreadOperationResult.Success -> onStarted(threadId)
            else -> onFailure()
        }
    }
}

internal fun homeQuickComposeAddWorktreeRequest(
    project: RemoteProject,
    branch: String,
): GitOperationRequest {
    val normalized = branch.trim()
    require(normalized.isNotEmpty()) { "branch must not be blank" }
    return GitRequests.create(
        GitProcedure.AddWorktree,
        project.location,
        mapOf(
            "branch" to JsonPrimitive(normalized),
            "createBranch" to JsonPrimitive(true),
        ),
    )
}

internal fun homeQuickComposeWorktreeFromOutcome(
    outcome: GitMutationOutcome,
    branch: String,
): HomeQuickComposeWorktree? {
    val path = (outcome as? GitMutationOutcome.Applied)
        ?.result
        ?.asObjectOrNull()
        ?.get("path")
        ?.stringOrNull()
        ?.takeIf(String::isNotEmpty)
    return path?.let { HomeQuickComposeWorktree(it, branch.trim(), isNew = true) }
}

internal fun createHomeQuickComposeWorktree(
    scope: CoroutineScope,
    projectRuntime: ProjectSessionRuntime,
    connectionId: ClientConnectionId,
    project: RemoteProject,
    branch: String,
    onFailure: () -> Unit,
    onCreated: (HomeQuickComposeWorktree) -> Unit,
) {
    val request = runCatching { homeQuickComposeAddWorktreeRequest(project, branch) }
        .getOrElse {
            onFailure()
            return
        }
    val target = ProjectWorkspaceTarget(
        identity = ProjectIdentity(connectionId, project.id),
        location = project.location,
    )
    scope.launch {
        when (val result = projectRuntime.gitOperations.execute(target, request)) {
            is GitExecutionResult.Completed -> {
                val worktree = homeQuickComposeWorktreeFromOutcome(result.outcome, branch)
                if (worktree == null) onFailure() else onCreated(worktree)
            }
            else -> onFailure()
        }
    }
}
