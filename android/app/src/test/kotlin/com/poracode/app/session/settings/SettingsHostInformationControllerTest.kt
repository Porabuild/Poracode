package com.poracode.app.session.settings

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsHostInformationControllerTest {
    @Test
    fun newestRequestWinsWithinTheSameHostAndSlot() = runTest {
        val active = lease()
        val session = MutableStateFlow<SettingsHostLease?>(active)
        val gateway = FakeSettingsSessionGateway()
        val firstStarted = CompletableDeferred<Unit>()
        val firstRelease = CompletableDeferred<Unit>()
        var call = 0
        gateway.agentHandler = {
            call += 1
            if (call == 1) {
                firstStarted.complete(Unit)
                firstRelease.await()
                agentSnapshot("old")
            } else {
                agentSnapshot("new")
            }
        }
        val controller = SettingsHostInformationController(session, gateway)

        val first = async { controller.loadAgentStatuses() }
        runCurrent()
        firstStarted.await()
        val second = controller.loadAgentStatuses()
        firstRelease.complete(Unit)

        assertTrue(second is SettingsOperationResult.Success)
        assertSame(SettingsOperationResult.Stale, first.await())
        assertEquals(
            "new",
            controller.state.value.entries.getValue(active.key).agentStatuses?.updatedAt,
        )
    }

    @Test
    fun hostSwitchMakesInflightCompletionStaleAndCannotPopulateNewHost() = runTest {
        val hostA = lease(connectionA, generation = 2)
        val hostB = lease(connectionB, generation = 7)
        val session = MutableStateFlow<SettingsHostLease?>(hostA)
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        val gateway = FakeSettingsSessionGateway().apply {
            settingsHandler = {
                started.complete(Unit)
                release.await()
                settingsSnapshot(true)
            }
        }
        val controller = SettingsHostInformationController(session, gateway)

        val request = async { controller.loadSettings() }
        runCurrent()
        started.await()
        session.value = hostB
        release.complete(Unit)

        assertSame(SettingsOperationResult.Stale, request.await())
        assertNull(controller.state.value.entries[hostA.key]?.settings)
        assertTrue(hostB.key !in controller.state.value.entries)
    }

    @Test
    fun readAndOperateScopesAreGatedWithoutCallingGateway() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(
            lease(scopes = setOf("session:read")),
        )
        var settingsCalls = 0
        var identityCalls = 0
        val gateway = object : SettingsSessionGateway by FakeSettingsSessionGateway() {
            override suspend fun readSettings(lease: SettingsHostLease) =
                settingsSnapshot().also { settingsCalls += 1 }

            override suspend fun updateProfileIdentity(
                lease: SettingsHostLease,
                request: com.poracode.app.model.settings.ProfileIdentityRequest,
            ) = FakeSettingsRemoteGateway().updateProfileIdentity(request).also {
                identityCalls += 1
            }
        }
        val controller = SettingsHostInformationController(session, gateway)

        assertTrue(controller.loadSettings() is SettingsOperationResult.Success)
        val denied = controller.updateProfileIdentity(
            com.poracode.app.model.settings.ProfileIdentityRequest("N", "h", "#000"),
        ) as SettingsOperationResult.Failed

        assertTrue(denied.failure is SettingsOperationFailure.AuthorizationDenied)
        assertEquals(1, settingsCalls)
        assertEquals(0, identityCalls)
    }
}
