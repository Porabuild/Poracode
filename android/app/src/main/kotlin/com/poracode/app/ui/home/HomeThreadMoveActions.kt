package com.poracode.app.ui.home

import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.ProjectWorkspaceTarget
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.session.projects.GitExecutionResult
import com.poracode.app.session.projects.ProjectSessionRuntime
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.threads.ThreadOperationResult
import com.poracode.app.session.threads.ThreadSessionRuntime
import com.poracode.app.ui.thread.ThreadLifecycleUiLogic
import java.util.UUID

/** Whether [thread] may move into a fresh worktree (mirrors desktop). */
internal fun canMoveThreadToWorktree(thread: RemoteThread?): Boolean =
    thread != null &&
        thread.worktreePath.isNullOrBlank() &&
        thread.archived != true &&
        thread.projectId != HOME_PROJECT_ID

/**
 * Android counterpart of the desktop move-thread-to-worktree action and the
 * iOS worktree-move controller: stop the runtime when active, create the
 * worktree + branch (optionally transferring uncommitted changes), point the
 * thread at it, then restart and reopen. A failure after stopping leaves the
 * thread inactive but untouched, so the user can relaunch it.
 */
internal suspend fun moveHomeThreadToWorktree(
    thread: RemoteThread,
    project: RemoteProject,
    target: ProjectWorkspaceTarget,
    bringChanges: Boolean,
    richChat: RichChatSessionRuntime,
    threadRuntime: ThreadSessionRuntime,
    projectRuntime: ProjectSessionRuntime,
    onOpenThread: (String) -> Unit,
): Boolean {
    if (!canMoveThreadToWorktree(thread)) return false
    val wasActive = thread.status != "inactive"
    val branch = generateWorktreeBranch()

    if (wasActive && richChat.chat.selection.value?.threadId == thread.id) {
        if (richChat.chat.closeThreadRuntime() !is RichChatOperationResult.Success) {
            return false
        }
    }

    val request = runCatching {
        homeQuickComposeAddWorktreeRequest(project, branch, transferChanges = bringChanges)
    }.getOrNull() ?: return false
    val worktree = when (val result = projectRuntime.gitOperations.execute(target, request)) {
        is GitExecutionResult.Completed ->
            homeQuickComposeWorktreeFromOutcome(result.outcome, branch) ?: return false
        else -> return false
    }

    val assigned = threadRuntime.controller.execute(
        ThreadLifecycleCommand.SetWorktree(
            threadId = thread.id,
            worktreePath = worktree.path ?: return false,
            worktreeBranch = worktree.branch,
            isNewWorktree = true,
        ),
    )
    if (assigned !is ThreadOperationResult.Success) return false

    if (wasActive) {
        val started = threadRuntime.controller.startExisting(
            ThreadLifecycleUiLogic.startExistingRequest(
                thread = thread,
                projectLocation = project.location,
                prompt = "",
                commandId = ThreadCommandId(UUID.randomUUID().toString()),
            ),
        )
        if (started !is ThreadOperationResult.Success) return false
        onOpenThread(thread.id)
    }
    return true
}
