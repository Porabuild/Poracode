package com.poracode.app.session.settings

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.transport.settings.SettingsRemoteGatewayProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GeneratedSettingsSessionGatewayTest {
    @Test
    fun exactGenerationProtocolAndScopeAreCheckedBeforeProvider() = runTest {
        val active = lease(generation = 4, scopes = setOf("session:read"))
        val session = MutableStateFlow<SettingsHostLease?>(active)
        var providerCalls = 0
        val gateway = GeneratedSettingsSessionGateway(
            session,
            SettingsRemoteGatewayProvider {
                providerCalls += 1
                FakeSettingsRemoteGateway()
            },
        )

        gateway.readSettings(active)
        val stale = failure { gateway.readSettings(active.copy(generation = 3)) }
        assertEquals("stale_lease", stale.code)
        val denied = failure {
            gateway.updateProfileIdentity(
                active,
                ProfileIdentityRequest("Name", "handle", "#000"),
            )
        }
        assertEquals("missing_scope", denied.code)
        session.value = active.copy(generation = 5, protocolVersion = 2)
        val mismatch = failure { gateway.readSettings(session.value!!) }
        assertEquals("protocol_version_mismatch", mismatch.code)
        assertEquals(1, providerCalls)
    }

    @Test
    fun staleHostAfterResponseNeverReturnsAValue() = runTest {
        val hostA = lease(connectionA, generation = 3)
        val hostB = lease(connectionB, generation = 9)
        val session = MutableStateFlow<SettingsHostLease?>(hostA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val remote = FakeSettingsRemoteGateway().apply {
            readHandler = {
                started.complete(Unit)
                release.await()
                settingsSnapshot()
            }
        }
        val gateway = GeneratedSettingsSessionGateway(
            session,
            SettingsRemoteGatewayProvider { remote },
        )
        val result = CompletableDeferred<Throwable?>()
        backgroundScope.launch {
            result.complete(runCatching { gateway.readSettings(hostA) }.exceptionOrNull())
        }
        runCurrent()
        started.await()
        session.value = hostB
        release.complete(Unit)

        assertEquals("stale_lease", (result.await() as SettingsGatewayException).code)
    }

    @Test
    fun mutationFailureIsSanitizedAmbiguousAndNeverRetried() = runTest {
        val active = lease()
        val session = MutableStateFlow<SettingsHostLease?>(active)
        val remote = FakeSettingsRemoteGateway().apply {
            writeHandler = {
                throw RemoteClientException("token access-secret server-payload", 0, "network")
            }
        }
        val gateway = GeneratedSettingsSessionGateway(
            session,
            SettingsRemoteGatewayProvider { remote },
        )
        val patch = HostSettingsPatch.from(buildJsonObject { put("titleGenFast", true) })

        val error = failure { gateway.writeSettings(active, patch) }
        assertEquals("network", error.code)
        assertTrue(error.requestMayHaveCommitted)
        assertFalse(error.message.orEmpty().contains("access-secret"))
        assertEquals(1, remote.writeCalls)
    }

    @Test
    fun reachableMutationRejectionIsNotAmbiguousAndUnknownCodesAreHidden() = runTest {
        val active = lease()
        val remote = FakeSettingsRemoteGateway().apply {
            writeHandler = {
                throw RemoteClientException("secret detail", 409, "provider_secret_failure")
            }
        }
        val gateway = GeneratedSettingsSessionGateway(
            MutableStateFlow(active),
            SettingsRemoteGatewayProvider { remote },
        )
        val patch = HostSettingsPatch.from(buildJsonObject { put("titleGenFast", true) })
        val error = failure { gateway.writeSettings(active, patch) }

        assertEquals("remote_error", error.code)
        assertFalse(error.requestMayHaveCommitted)
        assertFalse(error.message.orEmpty().contains("secret"))
    }

    @Test
    fun cancellationPropagatesUnchanged() = runTest {
        val active = lease()
        val cancellation = CancellationException("cancel exact instance")
        val remote = FakeSettingsRemoteGateway().apply {
            readHandler = { throw cancellation }
        }
        val gateway = GeneratedSettingsSessionGateway(
            MutableStateFlow(active),
            SettingsRemoteGatewayProvider { remote },
        )
        try {
            gateway.readSettings(active)
            fail("Expected cancellation")
        } catch (error: CancellationException) {
            assertSame(cancellation, error)
        }
    }

    private suspend fun failure(block: suspend () -> Unit): SettingsGatewayException {
        val error = runCatching { block() }.exceptionOrNull()
        if (error !is SettingsGatewayException) error("Expected SettingsGatewayException: $error")
        return error
    }
}
