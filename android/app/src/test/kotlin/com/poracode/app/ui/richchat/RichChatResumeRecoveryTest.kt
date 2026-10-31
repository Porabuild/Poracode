package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteSessionRef
import com.poracode.app.model.RemoteShellSnapshot
import com.poracode.app.model.RemoteThread
import com.poracode.app.model.RemoteThreadSnapshot
import com.poracode.app.model.ThreadConfig
import com.poracode.app.model.threads.ExistingThreadStartRequest
import com.poracode.app.model.threads.ThreadLifecycleCommand
import com.poracode.app.model.threads.ThreadPresentationMode
import com.poracode.app.session.AppSession
import com.poracode.app.session.catalog.CatalogStore
import com.poracode.app.session.richchat.FakeRichChatSessionGateway
import com.poracode.app.session.richchat.RichChatGatewayException
import com.poracode.app.session.richchat.RichChatHostLease
import com.poracode.app.session.richchat.RichChatOperationFailure
import com.poracode.app.session.richchat.RichChatOperationResult
import com.poracode.app.session.richchat.RichChatSessionRuntime
import com.poracode.app.session.richchat.THREAD_SESSION_ABSENCE_REFUSAL_CODE
import com.poracode.app.session.richchat.refreshHistory
import com.poracode.app.session.richchat.richLease
import com.poracode.app.session.richchat.richSnapshot
import com.poracode.app.session.richchat.sanitized
import com.poracode.app.session.threads.ThreadGatewayException
import com.poracode.app.session.threads.ThreadHostLease
import com.poracode.app.session.threads.ThreadLifecycleController
import com.poracode.app.session.threads.ThreadSessionGateway
import com.poracode.app.ui.home.openCatalogThread
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The resume action after the host restarted or the provider closed
 * unexpectedly. A restarted host holds no session for the thread and refuses
 * the send with a typed pre-effect 422, so the resume relaunches the thread
 * with the same prompt (desktop's resume launch), never after an ambiguous
 * failure, never on a thread the live catalog shows running again, and never
 * while an uncertain attempt awaits reconciliation. An unexpected close
 * settles the row with a marker but sends no
 * `turn.completed`, so the row outranks the transcript's stale open turn.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RichChatResumeRecoveryTest {
    @Test
    fun aSendTheHostRefusedForWantOfASessionRelaunchesTheThreadWithTheSamePrompt() = runTest {
        var latest = row(sessionRef = sessionRef("session-a"))
        val gateway = FakeRichChatSessionGateway().also {
            it.unitHandler = { name ->
                if (name == "send") {
                    // The row moves on while the send is out; the relaunch reads the newest one.
                    latest = row(sessionRef = sessionRef("session-b"))
                    throw refusal()
                }
            }
        }
        val runtime = runtime(gateway)
        val threads = FakeThreadGateway()

        val result = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Resend("Fix the build"),
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
            relaunch = relaunch(threads) { latest },
        )

        assertTrue(result is RichChatOperationResult.Success)
        assertEquals(listOf("send"), gateway.calls)
        val start = threads.starts.single()
        assertEquals("thread-a", start.threadId)
        assertEquals("Fix the build", start.prompt)
        assertEquals(PosixProjectLocation("/repo"), start.projectLocation)
        assertEquals("gpt-5", start.config.model)
        assertEquals(ThreadPresentationMode.Gui, start.presentationMode)
        assertEquals("session-b", start.sessionRef?.get("providerSessionId")?.jsonPrimitive?.content)
        // Mutation receipts are permanent, so each relaunch carries a fresh id.
        assertNotEquals("thread-a", start.commandId.value)
        UUID.fromString(start.commandId.value)
        // The relaunch replaced the refused send, so no failure is left on the banner.
        assertNull(runtime.chat.state.value.failure)
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
    }

    @Test
    fun theContinuePromptRelaunchesAndTheActionWaitsForTheRelaunchThenTheHost() = runTest {
        var latest = row()
        val gateway = refusingGateway()
        val runtime = runtime(gateway)
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Success)
        val threads = FakeThreadGateway().apply { gate = CompletableDeferred() }
        val resume = RichChatThreadResume(runtime, this, relaunch(threads) { latest }) { CONTINUE }
        fun offered() = resume.plan(latest, runtime.chat.state.value, canSubmit = true, composerEmpty = true)
        assertEquals(RichChatResumePlan.Resend("Fix the build"), offered())

        resume.resume(RichChatResumePlan.Continue, ThreadConfig(model = "gpt-5"), runtime.chat.state.value, latest)
        runCurrent()
        // The relaunch is out: the action is withheld and a second tap does nothing.
        assertNull(offered())
        resume.resume(RichChatResumePlan.Continue, ThreadConfig(model = "gpt-5"), runtime.chat.state.value, latest)
        threads.gate!!.complete(Unit)
        advanceUntilIdle()

        assertEquals(listOf("send"), gateway.calls.filter { it == "send" })
        assertEquals(listOf(CONTINUE), threads.starts.map(ExistingThreadStartRequest::prompt))
        // Accepted: the host owns the turn, so the action waits for the row's restatement.
        assertNull(offered())
        latest = latest.copy(updatedAt = "2026-10-29T00:05:00Z")
        assertEquals(RichChatResumePlan.Resend("Fix the build"), offered())
    }

    @Test
    fun anAmbiguousOrOtherwiseRejectedSendIsNeverRelaunched() = runTest {
        for (error in listOf(
            RichChatGatewayException(0, "network", true),
            RichChatGatewayException(409, "conflict", false),
            RichChatGatewayException(422, "remote_error", false),
        )) {
            val gateway = FakeRichChatSessionGateway().also {
                it.unitHandler = { name -> if (name == "send") throw error }
            }
            val runtime = runtime(gateway)
            val threads = FakeThreadGateway()

            val result = resend(runtime, relaunch(threads) { row() })

            assertTrue(error.code, result is RichChatOperationResult.Failed)
            assertTrue(error.code, threads.starts.isEmpty())
            assertEquals(error.code, listOf("send"), gateway.calls)
        }
    }

    @Test
    fun onlyASettledRowThatCanResumeItsSessionIsRelaunched() {
        val refused = RichChatOperationFailure.Remote(422, THREAD_SESSION_ABSENCE_REFUSAL_CODE, false)

        assertTrue(RichChatResumePlanner.relaunchesAfter(refused, row()))
        assertTrue(RichChatResumePlanner.relaunchesAfter(refused, row(canResumeWithConfig = null)))
        assertTrue(RichChatResumePlanner.relaunchesAfter(refused, row(sessionRef = null)))
        // Like desktop: no session to resume and no config resume, no relaunch.
        assertFalse(
            RichChatResumePlanner.relaunchesAfter(
                refused,
                row(sessionRef = null, canResumeWithConfig = false),
            ),
        )
        for (status in listOf("launching", "working", "needs_approval", "needs_reply")) {
            assertFalse(status, RichChatResumePlanner.relaunchesAfter(refused, row(status = status)))
        }
        assertFalse(RichChatResumePlanner.relaunchesAfter(refused, null))
        assertFalse(RichChatResumePlanner.relaunchesAfter(refused.copy(requestMayHaveCommitted = true), row()))
        assertFalse(RichChatResumePlanner.relaunchesAfter(refused.copy(code = "conflict"), row()))
        assertFalse(RichChatResumePlanner.relaunchesAfter(RichChatOperationFailure.Offline, row()))
    }

    @Test
    fun aRefusalWithoutAKnownLocationOrForAnotherThreadKeepsTheFailure() = runTest {
        for (build in listOf(
            { threads: FakeThreadGateway -> relaunch(threads, location = null) { row() } },
            { threads: FakeThreadGateway -> relaunch(threads) { row().copy(id = "thread-b") } },
        )) {
            val runtime = runtime(refusingGateway())
            val threads = FakeThreadGateway()

            val result = resend(runtime, build(threads))

            assertEquals(RichChatOperationResult.Failed(REFUSED), result)
            assertTrue(threads.starts.isEmpty())
            assertEquals(REFUSED, runtime.chat.state.value.failure)
        }
    }

    @Test
    fun aFailedRelaunchKeepsTheActionAndAnUncertainOneIsReconciledNotResent() = runTest {
        val row = row()
        val items = listOf(typed("u1", "Fix the build"))
        val failedRuntime = runtime(refusingGateway())
        val failedStarts = FakeThreadGateway().apply {
            failure = ThreadGatewayException(409, "conflict", false)
        }

        val failed = resend(failedRuntime, relaunch(failedStarts) { row })

        assertEquals(RichChatOperationResult.Failed(REFUSED), failed)
        assertEquals(1, failedStarts.starts.size)
        assertEquals(REFUSED, failedRuntime.chat.state.value.failure)
        val afterFailure = RichChatResumePlanner.suppressionAfterSubmit(failed, row, previous = null)
        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            RichChatResumePlanner.offer(row, items, true, true, false, afterFailure),
        )

        val uncertainGateway = refusingGateway()
        val uncertainRuntime = runtime(uncertainGateway)
        val uncertainStarts = FakeThreadGateway().apply {
            failure = ThreadGatewayException(0, "network", true)
        }

        val uncertain = resend(uncertainRuntime, relaunch(uncertainStarts) { row })

        val outcome = (uncertain as RichChatOperationResult.Failed).failure
        assertEquals(RichChatOperationFailure.Remote(0, "network", true), outcome)
        assertEquals(outcome, uncertainRuntime.chat.state.value.failure)
        // One authoritative read reconciles it; neither the send nor the relaunch is repeated.
        assertTrue(uncertainRuntime.chat.state.value.needsAuthoritativeRefresh)
        assertEquals(listOf("send"), uncertainGateway.calls)
        assertEquals(1, uncertainStarts.starts.size)
    }

    @Test
    fun aWorkingRowDeliveredWhileTheSendWasOutIsNeverRestarted() = runTest {
        val stale = row()
        var appState = AppSession.UiState(
            openThreadId = "thread-a",
            snapshot = RemoteShellSnapshot(snapshotSeq = 1, threads = listOf(stale), updatedAt = stale.updatedAt),
            threadSnapshot = RemoteThreadSnapshot(snapshotSeq = 1, thread = stale, updatedAt = stale.updatedAt),
        )
        val gateway = FakeRichChatSessionGateway().also {
            it.unitHandler = { name ->
                if (name == "send") {
                    // Another client starts the turn. Its live state reaches the
                    // catalog before the pending refusal; the history read lags.
                    val started = RemoteJson.parseToJsonElement(
                        """{"status":"working","attention":"working","interruptedTurn":null}""",
                    ).jsonObject
                    appState = CatalogStore.applyLiveThread(
                        appState,
                        "thread-a",
                        3,
                        CatalogStore.threadStateMutation(started, "2026-10-29T00:01:00Z")!!,
                    )
                    throw RemoteClientException("Unknown thread session", 422, THREAD_SESSION_ABSENCE_REFUSAL_CODE)
                        .sanitized(mutation = true)
                }
            }
        }
        val runtime = runtime(gateway)
        val threads = FakeThreadGateway()

        val result = resend(runtime, relaunch(threads) { appState.openCatalogThread() })

        // The host's start replaces a live session, so the running turn is left alone.
        assertEquals(emptyList<String>(), threads.starts.map(ExistingThreadStartRequest::threadId))
        assertEquals(RichChatOperationResult.Failed(REFUSED), result)
        assertEquals(REFUSED, runtime.chat.state.value.failure)
        assertEquals("working", appState.openCatalogThread()?.status)
        assertNull(appState.openCatalogThread()?.interruptedTurn)
        assertEquals("inactive", appState.threadSnapshot?.thread?.status)
    }

    @Test
    fun anUncertainRelaunchWithholdsTheActionUntilAReadReconcilesIt() = runTest {
        val gateway = refusingGateway()
        val runtime = runtime(gateway)
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Success)
        val threads = FakeThreadGateway().apply { failure = ThreadGatewayException(0, "network", true) }
        val row = row()
        val resume = RichChatThreadResume(runtime, this, relaunch(threads) { row }) { CONTINUE }
        fun offered() = resume.plan(row, runtime.chat.state.value, canSubmit = true, composerEmpty = true)
        val plan = offered()

        resume.resume(plan, ThreadConfig(model = "gpt-5"), runtime.chat.state.value, row)
        advanceUntilIdle()
        assertTrue(runtime.chat.state.value.needsAuthoritativeRefresh)

        // The authoritative read fails, so nothing is reconciled: the action stays
        // withheld and a tap that outran the recomposition does nothing.
        val history = gateway.historyHandler
        gateway.historyHandler = { _, _ -> throw RichChatGatewayException(503, "server_unavailable", false) }
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Failed)
        assertTrue(runtime.chat.state.value.needsAuthoritativeRefresh)
        assertNull(offered())
        resume.resume(plan, ThreadConfig(model = "gpt-5"), runtime.chat.state.value, row)
        advanceUntilIdle()
        assertEquals(1, gateway.calls.count { it == "send" })
        assertEquals(1, threads.starts.size)

        // A successful read reconciles it; the host left the row cut off, so the action returns.
        gateway.historyHandler = history
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Success)
        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
        assertEquals(RichChatResumePlan.Resend("Fix the build"), offered())
    }

    @Test
    fun aSessionDeliveredBeforeARestartIsTheOneTheRelaunchResumes() = runTest {
        val old = row(sessionRef = sessionRef("session-a"))
        var appState = AppSession.UiState(
            openThreadId = "thread-a",
            snapshot = RemoteShellSnapshot(snapshotSeq = 1, threads = listOf(old), updatedAt = old.updatedAt),
        )
        fun deliver(seq: Long, json: String) {
            appState = CatalogStore.applyLiveThread(
                appState,
                "thread-a",
                seq,
                CatalogStore.threadStateMutation(
                    RemoteJson.parseToJsonElement(json).jsonObject,
                    "2026-10-29T00:01:00Z",
                )!!,
            )
        }
        // The live session reports a new provider session; then the supervisor
        // resets, and the host publishes restart while keeping that reference.
        deliver(
            2,
            """{"status":"working","attention":"working","canResumeWithConfig":true,"sessionRef":{"providerSessionId":"session-b","discoveredAt":"2026-10-29T00:01:00Z"},"interruptedTurn":null}""",
        )
        deliver(
            3,
            """{"status":"inactive","attention":"none","canResumeWithConfig":true,"interruptedTurn":"restart"}""",
        )
        val runtime = runtime(refusingGateway())
        val threads = FakeThreadGateway()

        val result = submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Continue,
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
            relaunch = relaunch(threads) { appState.openCatalogThread() },
        )

        // The interrupted conversation is the newer one; the older one lacks its context.
        assertEquals(
            listOf("session-b"),
            threads.starts.map { it.sessionRef?.get("providerSessionId")?.jsonPrimitive?.content },
        )
        assertEquals(listOf(CONTINUE), threads.starts.map(ExistingThreadStartRequest::prompt))
        assertTrue(result is RichChatOperationResult.Success)
    }

    @Test
    fun theHostsTypedRefusalSurvivesTheGatewaysErrorSanitizing() {
        val sanitized = RemoteClientException(
            "Unknown thread session: thread-a",
            422,
            THREAD_SESSION_ABSENCE_REFUSAL_CODE,
        ).sanitized(mutation = true)

        assertEquals(422, sanitized.statusCode)
        assertEquals(THREAD_SESSION_ABSENCE_REFUSAL_CODE, sanitized.code)
        assertFalse(sanitized.requestMayHaveCommitted)
    }

    @Test
    fun aSettledRowWithACutOffMarkerOutranksTheOpenTurnAnUnexpectedCloseLeaves() = runTest {
        val lease = richLease()
        val gateway = FakeRichChatSessionGateway().also {
            it.historyHandler = { _, _ -> richSnapshot(lease, items = listOf(typed("u1", "Fix the build"))) }
        }
        val runtime = RichChatSessionRuntime(
            MutableStateFlow<RichChatHostLease?>(lease),
            gateway,
            scope = backgroundScope,
        ).also { it.selectThread("thread-a") }
        assertTrue(runtime.chat.refreshHistory() is RichChatOperationResult.Success)
        fun deliver(sequence: Int, json: String) =
            runtime.applyServerEvent(sequence, RemoteJson.parseToJsonElement(json))
        val turn = """{"type":"turn.started","threadId":"thread-a","turnId":"turn-a"}"""
        deliver(2, """{"type":"thread-runtime-event","threadId":"thread-a","event":$turn}""")
        // The host's unexpected-close sequence: inactive with a marker, then
        // the exit, and no `turn.completed` for the open turn.
        deliver(
            3,
            """{"type":"thread-state","threadId":"thread-a","status":"inactive","attention":"none","interruptedTurn":"error"}""",
        )
        deliver(4, """{"type":"thread-exited","threadId":"thread-a","exitCode":null}""")
        val state = runtime.chat.state.value
        assertEquals(true, state.transcript?.openTurn)
        val settled = row(marker = "error")
        val resume = RichChatThreadResume(runtime, this, relaunch(FakeThreadGateway()) { settled }) { CONTINUE }

        // The composer drops Stop and offers the resume, as desktop does.
        assertFalse(resume.isTurnActive(state, settled))
        assertEquals(
            RichChatResumePlan.Resend("Fix the build"),
            resume.plan(settled, state, canSubmit = true, composerEmpty = true),
        )
        // Until the host settles the row, its open turn still holds.
        for (live in listOf(settled.copy(status = "working"), settled.copy(interruptedTurn = null))) {
            assertTrue(resume.isTurnActive(state, live))
            assertNull(resume.plan(live, state, canSubmit = true, composerEmpty = true))
        }
    }

    private fun TestScope.runtime(gateway: FakeRichChatSessionGateway): RichChatSessionRuntime {
        gateway.historyHandler = { lease, _ -> richSnapshot(lease, items = listOf(typed("u1", "Fix the build"))) }
        return RichChatSessionRuntime(
            MutableStateFlow<RichChatHostLease?>(richLease()),
            gateway,
            scope = backgroundScope,
        ).also { it.selectThread("thread-a") }
    }

    private suspend fun resend(runtime: RichChatSessionRuntime, relaunch: RichChatResumeRelaunch) =
        submitRichChatResume(
            runtime = runtime,
            plan = RichChatResumePlan.Resend("Fix the build"),
            continuePrompt = CONTINUE,
            configuration = ThreadConfig(model = "gpt-5"),
            activeRequest = null,
            relaunch = relaunch,
        )

    private fun refusingGateway() = FakeRichChatSessionGateway().also {
        it.unitHandler = { name -> if (name == "send") throw refusal() }
    }

    private fun refusal() = RichChatGatewayException(422, THREAD_SESSION_ABSENCE_REFUSAL_CODE, false)

    private fun relaunch(
        threads: FakeThreadGateway,
        location: ProjectLocation? = PosixProjectLocation("/repo"),
        latest: () -> RemoteThread?,
    ) = RichChatResumeRelaunch(
        ThreadLifecycleController(MutableStateFlow<ThreadHostLease?>(THREAD_LEASE), threads) {},
        latestThread = latest,
        projectLocation = { location },
    )

    private fun row(
        status: String = "inactive",
        marker: String? = "restart",
        sessionRef: RemoteSessionRef? = sessionRef("session-a"),
        canResumeWithConfig: Boolean? = true,
    ) = RemoteThread(
        id = "thread-a",
        projectId = "p1",
        title = "Thread",
        agentKind = "agent",
        status = status,
        attention = "none",
        canResumeWithConfig = canResumeWithConfig,
        presentationMode = "gui",
        createdAt = "2026-10-29T00:00:00Z",
        updatedAt = "2026-10-29T00:00:00Z",
        sessionRef = sessionRef,
        interruptedTurn = marker,
    )

    private fun sessionRef(id: String) = RemoteSessionRef(id, "2026-10-29T00:00:00Z")

    private fun typed(id: String, text: String) = RichRuntimeItem(
        id = id,
        type = RichItemTypes.USER_MESSAGE,
        state = RichItemState.COMPLETED,
        payload = RemoteJson.parseToJsonElement(
            """{"content":[{"kind":"text","text":${JsonPrimitive(text)}}]}""",
        ),
    )

    private class FakeThreadGateway : ThreadSessionGateway {
        val starts = mutableListOf<ExistingThreadStartRequest>()
        var failure: Throwable? = null
        var gate: CompletableDeferred<Unit>? = null

        override suspend fun startExisting(
            lease: ThreadHostLease,
            request: ExistingThreadStartRequest,
        ): String {
            starts += request
            gate?.await()
            failure?.let { throw it }
            return request.threadId
        }

        override suspend fun command(lease: ThreadHostLease, command: ThreadLifecycleCommand) = Unit
    }

    private companion object {
        const val CONTINUE = "Continue from where you left off."
        val REFUSED = RichChatOperationFailure.Remote(422, THREAD_SESSION_ABSENCE_REFUSAL_CODE, false)
        val THREAD_LEASE = ThreadHostLease(
            ClientConnectionId("11111111-1111-4111-8111-111111111111"),
            1,
            setOf("session:operate"),
            online = true,
            ready = true,
        )
    }
}
