package com.poracode.app.session.browsermirror

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.transport.browsermirror.BrowserMirrorHostTransports
import com.poracode.app.transport.browsermirror.BrowserMirrorRemoteGateway
import com.poracode.app.transport.browsermirror.BrowserMirrorTransportProvider
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GeneratedBrowserMirrorSessionGatewayTest {
    private val readScopes = setOf("session:read")

    private fun lease(
        connectionId: String = "host-A",
        generation: Long = 1L,
        socketGeneration: Long = 10L,
        foreground: Boolean = true,
        online: Boolean = true,
        ready: Boolean = true,
        scopes: Set<String> = setOf("session:read", "session:operate"),
    ) = BrowserMirrorHostLease(connectionId, generation, socketGeneration, scopes, foreground, online, ready)

    private class FakeRemoteGateway : BrowserMirrorRemoteGateway {
        var stateResult: BrowserState = BrowserState(emptyList(), null)
        var commandResult: BrowserState = BrowserState(emptyList(), null)
        var stateException: Exception? = null
        var commandException: Exception? = null
        var onCommand: (suspend () -> Unit)? = null
        val sends = mutableListOf<String>()

        override suspend fun state(): BrowserState {
            stateException?.let { throw it }
            return stateResult
        }

        override suspend fun command(command: BrowserCommand): BrowserState {
            onCommand?.invoke()
            commandException?.let { throw it }
            return commandResult
        }

        override suspend fun sendWatch(): Boolean { sends += "watch"; return true }
        override suspend fun sendUnwatch(): Boolean { sends += "unwatch"; return true }
        override suspend fun sendInput(input: BrowserInput): Boolean { sends += "input"; return true }
    }

    private class FakeProvider(val gateway: FakeRemoteGateway) : BrowserMirrorTransportProvider {
        var transportsCalls = 0
        override suspend fun transportsFor(lease: BrowserMirrorHostLease): BrowserMirrorHostTransports {
            transportsCalls++
            return BrowserMirrorHostTransports(gateway)
        }
    }

    @Test
    fun staleLeaseIsRejectedBeforeAnyTransportWork() = runTest {
        val current = lease()
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(current)
        val provider = FakeProvider(FakeRemoteGateway())
        val gateway = GeneratedBrowserMirrorSessionGateway(leases, provider)

        val stale = lease(socketGeneration = 999L)
        val error = runCatching { gateway.command(stale, BrowserCommand.Reload("t1")) }
            .exceptionOrNull() as BrowserMirrorGatewayException
        assertEquals("stale_lease", error.code)
        assertEquals(0, provider.transportsCalls)
    }

    @Test
    fun backgroundAndMissingScopeAreSurfacedAsDomainFailures() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease(foreground = false))
        val provider = FakeProvider(FakeRemoteGateway())
        val gateway = GeneratedBrowserMirrorSessionGateway(leases, provider)

        assertEquals(
            "background",
            (runCatching { gateway.state(lease()) }.exceptionOrNull() as BrowserMirrorGatewayException).code,
        )

        leases.value = lease(foreground = true, scopes = readScopes)
        assertEquals(
            "missing_scope",
            (runCatching {
                gateway.command(leases.value!!, BrowserCommand.Reload("t1"))
            }.exceptionOrNull() as BrowserMirrorGatewayException).code,
        )
    }

    @Test
    fun transportFailureIsAmbiguousOnlyForMutations() = runTest {
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(lease())
        val remote = FakeRemoteGateway().apply {
            commandException = RemoteClientException("boom", 0, "network")
            stateException = RemoteClientException("boom", 0, "network")
        }
        val provider = FakeProvider(remote)
        val gateway = GeneratedBrowserMirrorSessionGateway(leases, provider)

        val commandError = runCatching {
            gateway.command(lease(), BrowserCommand.Reload("t1"))
        }.exceptionOrNull() as BrowserMirrorGatewayException
        assertTrue("mutation must be ambiguous", commandError.ambiguousMutation)

        val stateError = runCatching { gateway.state(lease()) }
            .exceptionOrNull() as BrowserMirrorGatewayException
        assertFalse("read must not be ambiguous", stateError.ambiguousMutation)
    }

    @Test
    fun postDispatchLeaseChangeIsDetectedAfterTheOperation() = runTest {
        val initial = lease(socketGeneration = 10L)
        val leases = MutableStateFlow<BrowserMirrorHostLease?>(initial)
        val remote = FakeRemoteGateway().apply {
            commandResult = BrowserState(emptyList(), null)
            onCommand = { leases.value = lease(socketGeneration = 11L) }
        }
        val provider = FakeProvider(remote)
        val gateway = GeneratedBrowserMirrorSessionGateway(leases, provider)

        val error = runCatching {
            gateway.command(initial, BrowserCommand.Reload("t1"))
        }.exceptionOrNull() as BrowserMirrorGatewayException
        // Operation ran (transports resolved) but the post-await recheck rejects the stale lease.
        assertEquals(1, provider.transportsCalls)
        assertEquals("stale_lease", error.code)
        assertFalse(error.ambiguousMutation)
        assertNull("no replay attempted", provider.gateway.sends.firstOrNull())
    }
}
