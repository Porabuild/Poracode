package com.poracode.app.ui.thread

import androidx.annotation.StringRes
import com.poracode.app.R
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.model.threads.ThreadTerminalSize
import com.poracode.app.session.threads.ThreadOperationFailure

internal object ThreadLifecycleUiLogic {
    /**
     * Builds the thread-start-existing request for an explicit user relaunch.
     * Each relaunch carries a caller-supplied fresh command id; the server treats
     * mutation receipts as permanent, so the id must never be derived from the
     * thread id or reused across attempts.
     */
    fun startExistingRequest(
        thread: RemoteThread,
        projectLocation: ProjectLocation,
        prompt: String,
        commandId: ThreadCommandId,
        initialSize: ThreadTerminalSize = DEFAULT_RELAUNCH_SIZE,
    ): ExistingThreadStartRequest = ExistingThreadStartRequest(
        threadId = thread.id,
        projectLocation = projectLocation,
        agentKind = thread.agentKind,
        config = thread.config,
        initialSize = initialSize,
        commandId = commandId,
        prompt = prompt,
        agentInstanceId = thread.agentInstanceId,
        presentationMode = thread.presentationMode.toPresentationMode(),
    )

    @StringRes
    fun failureMessage(failure: ThreadOperationFailure): Int =
        if (failure is ThreadOperationFailure.Remote && failure.requestMayHaveCommitted) {
            R.string.thread_lifecycle_failure_ambiguous
        } else {
            R.string.thread_lifecycle_failure_generic
        }

    private fun String?.toPresentationMode(): ThreadPresentationMode? = when (this) {
        "terminal" -> ThreadPresentationMode.Terminal
        "gui" -> ThreadPresentationMode.Gui
        else -> null
    }

    private val DEFAULT_RELAUNCH_SIZE = ThreadTerminalSize(120, 30)
}
