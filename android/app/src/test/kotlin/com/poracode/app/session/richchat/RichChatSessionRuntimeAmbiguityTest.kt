package com.poracode.app.session.richchat

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RichChatSessionRuntimeAmbiguityTest {
    @Test
    fun ambiguousMutationRunsExactlyOneAuthoritativeRefreshAndNeverReplays() = runTest {
        val session = MutableStateFlow<RichChatHostLease?>(richLease())
        val gateway = FakeRichChatSessionGateway()
        val release = CompletableDeferred<Unit>()
        gateway.historyHandler = { lease, threadId ->
            release.await()
            richSnapshot(lease, threadId)
        }
        gateway.unitHandler = { name ->
            if (name == "send") {
                throw RichChatGatewayException(500, "request_failed", true)
            }
        }
        val runtime = RichChatSessionRuntime(session, gateway, scope = backgroundScope)
        runtime.selectThread("thread-a")
        runtime.chat.installAuthoritativeSnapshot(
            runtime.chat.selection.value!!,
            richSnapshot(),
        )

        val result = runtime.chat.send("hello")

        val failure = (result as RichChatOperationResult.Failed).failure
            as RichChatOperationFailure.Remote
        assertTrue(failure.requestMayHaveCommitted)
        assertTrue(runtime.chat.state.value.needsAuthoritativeRefresh)
        assertEquals(1, gateway.calls.count { it == "send" })

        runtime.refreshSelectedThread()
        testScheduler.runCurrent()
        assertEquals(1, gateway.calls.count { it == "history" })
        runtime.refreshSelectedThread()
        runtime.refreshSelectedThread()
        testScheduler.runCurrent()
        assertEquals(1, gateway.calls.count { it == "history" })

        release.complete(Unit)
        testScheduler.runCurrent()

        assertFalse(runtime.chat.state.value.needsAuthoritativeRefresh)
        assertEquals(1, gateway.calls.count { it == "history" })
        assertEquals(1, gateway.calls.count { it == "send" })
    }
}
