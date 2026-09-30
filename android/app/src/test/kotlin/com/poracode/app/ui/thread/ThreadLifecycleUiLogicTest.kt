package com.poracode.app.ui.thread

import com.poracode.app.R
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ThreadCommandId
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.threads.ThreadOperationFailure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class ThreadLifecycleUiLogicTest {
    @Test
    fun relaunchBuildsThreadStartExistingRequestWithCanonicalConfiguration() {
        val thread = RemoteThread(
            id = "thread-1",
            projectId = "project-1",
            title = "Build",
            agentKind = "codex",
            agentInstanceId = "agent-1",
            config = ThreadConfig(model = "gpt-5", effort = "high", fast = true),
            status = "idle",
            attention = "none",
            worktreePath = "/repo/wt",
            worktreeBranch = "feature",
            presentationMode = "terminal",
            createdAt = "2026-08-12T00:00:00Z",
            updatedAt = "2026-08-12T00:00:00Z",
            parentThreadId = "parent-1",
        )

        val request = ThreadLifecycleUiLogic.startExistingRequest(
            thread,
            PosixProjectLocation("/repo"),
            "Continue",
            ThreadCommandId("command-1"),
        )

        assertEquals("thread-1", request.threadId)
        assertEquals(PosixProjectLocation("/repo"), request.projectLocation)
        assertEquals("codex", request.agentKind)
        assertEquals("agent-1", request.agentInstanceId)
        assertEquals("gpt-5", request.config.model)
        assertEquals("Continue", request.prompt)
        assertEquals("command-1", request.commandId.value)
        // Thread-start-existing is a runtime launch, not a path-scoped command:
        // the request body never carries a path thread id, only the launch fields.
        assertEquals(ThreadPresentationMode.Terminal, request.presentationMode)
        assertNotNull(request.initialSize)
    }

    @Test
    fun onlyAmbiguousRemoteFailureUsesRefreshMessage() {
        assertEquals(
            R.string.thread_lifecycle_failure_ambiguous,
            ThreadLifecycleUiLogic.failureMessage(
                ThreadOperationFailure.Remote(null, "network", requestMayHaveCommitted = true),
            ),
        )
        assertEquals(
            R.string.thread_lifecycle_failure_generic,
            ThreadLifecycleUiLogic.failureMessage(ThreadOperationFailure.Offline),
        )
    }
}
