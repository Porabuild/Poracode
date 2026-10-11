package com.poracode.app.ui.settings

import com.poracode.app.model.settings.HostSettingsPatch
import com.poracode.app.model.settings.GlobalMcpProbeResult
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsOperation
import com.poracode.app.model.settings.GlobalMcpSettingsOperationResult
import com.poracode.app.model.settings.ProfileIdentityRequest
import com.poracode.app.model.settings.ProfileStatsRequest
import com.poracode.app.session.settings.FakeSettingsRemoteGateway
import com.poracode.app.session.settings.FakeSettingsSessionGateway
import com.poracode.app.session.settings.SettingsGatewayException
import com.poracode.app.session.settings.SettingsHostInformationController
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.lease
import com.poracode.app.session.settings.settingsSnapshot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsUiControllerTest {
    @Test
    fun globalMcpOperationsAreSerializedUntilTheCurrentRequestCompletes() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(
            lease(scopes = setOf("projects:manage")),
        )
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var calls = 0
        val gateway = FakeSettingsSessionGateway().apply {
            mcpOperationHandler = { _, _ ->
                calls += 1
                started.complete(Unit)
                release.await()
                GlobalMcpSettingsOperationResult.Probe(
                    GlobalMcpProbeResult("available", 12, 1, listOf("read")),
                )
            }
        }
        val controller = GlobalMcpSettingsController(session, gateway, backgroundScope)

        controller.probe("first")
        runCurrent()
        started.await()
        assertTrue(controller.state.value.mutating)
        controller.probe("second")
        runCurrent()
        assertEquals(1, calls)

        release.complete(Unit)
        runCurrent()
        assertFalse(controller.state.value.mutating)
        assertTrue("first" in controller.state.value.probes)
        assertFalse("second" in controller.state.value.probes)
    }

    @Test
    fun ambiguousSettingsMutationIsAttemptedOnceThenReadOnce() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(lease())
        var writes = 0
        var reads = 0
        val gateway = FakeSettingsSessionGateway().apply {
            settingsWriteHandler = { _, _ ->
                writes += 1
                throw SettingsGatewayException(0, "network", true)
            }
            settingsHandler = {
                reads += 1
                settingsSnapshot()
            }
        }
        val information = SettingsHostInformationController(session, gateway)
        val controller = SettingsUiController(
            session,
            information,
            backgroundScope,
            { ProfileStatsRequest(0.0) },
        )

        controller.saveSettings(patch())
        runCurrent()

        assertEquals(1, writes)
        assertEquals(1, reads)
        val outcome = controller.mutation.value.settingsOutcome as SettingsMutationOutcome.Failed
        assertTrue(outcome.refreshedAfterAmbiguousResult)
        assertFalse(controller.mutation.value.settingsSaving)
    }

    @Test
    fun secondTapCannotDuplicateAnInflightMutation() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(lease())
        val started = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        var writes = 0
        val gateway = FakeSettingsSessionGateway().apply {
            settingsWriteHandler = { _, _ ->
                writes += 1
                started.complete(Unit)
                release.await()
                settingsSnapshot(true)
            }
        }
        val information = SettingsHostInformationController(session, gateway)
        val controller = SettingsUiController(
            session,
            information,
            backgroundScope,
            { ProfileStatsRequest(0.0) },
        )

        controller.saveSettings(patch())
        runCurrent()
        started.await()
        controller.saveSettings(patch())
        runCurrent()
        assertEquals(1, writes)
        release.complete(Unit)
        runCurrent()
        assertTrue(controller.mutation.value.settingsOutcome is SettingsMutationOutcome.Applied)
    }

    @Test
    fun screenActionsCoverAllEightGeneratedSettingsRoutes() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(lease())
        val calls = linkedMapOf<String, Int>()
        fun called(name: String) {
            calls[name] = calls.getOrDefault(name, 0) + 1
        }
        val remote = FakeSettingsRemoteGateway()
        val gateway = object : com.poracode.app.session.settings.SettingsSessionGateway {
            override suspend fun agentStatuses(lease: SettingsHostLease) =
                remote.agentStatuses().also { called("agent-statuses") }

            override suspend fun providerUsage(lease: SettingsHostLease) =
                remote.providerUsage().also { called("provider-usage") }

            override suspend fun profileDevices(lease: SettingsHostLease) =
                remote.profileDevices().also { called("profile-devices") }

            override suspend fun profileCoreStats(
                lease: SettingsHostLease,
                request: ProfileStatsRequest,
            ) = remote.profileCoreStats(request).also { called("profile-core-stats") }

            override suspend fun profileTokenStats(
                lease: SettingsHostLease,
                request: ProfileStatsRequest,
            ) = remote.profileTokenStats(request).also { called("profile-token-stats") }

            override suspend fun updateProfileIdentity(
                lease: SettingsHostLease,
                request: ProfileIdentityRequest,
            ) = remote.updateProfileIdentity(request).also { called("profile-identity") }

            override suspend fun readSettings(lease: SettingsHostLease) =
                remote.readSettings().also { called("settings-read") }

            override suspend fun writeSettings(
                lease: SettingsHostLease,
                patch: HostSettingsPatch,
            ) = remote.writeSettings(patch).also { called("settings-write") }

            override suspend fun readGlobalMcpSettings(lease: SettingsHostLease) =
                remote.readGlobalMcpSettings()

            override suspend fun commandGlobalMcpSettings(
                lease: SettingsHostLease,
                command: GlobalMcpSettingsCommand,
            ) = remote.commandGlobalMcpSettings(command)

            override suspend fun operateGlobalMcpSettings(
                lease: SettingsHostLease,
                operation: GlobalMcpSettingsOperation,
            ) = remote.operateGlobalMcpSettings(operation)
        }
        val information = SettingsHostInformationController(session, gateway)
        val controller = SettingsUiController(
            session,
            information,
            backgroundScope,
            { ProfileStatsRequest(0.0) },
        )

        controller.refresh(SettingsPane.Agents)
        controller.refresh(SettingsPane.Usage)
        controller.refresh(SettingsPane.Profile)
        controller.refresh(SettingsPane.Preferences)
        runCurrent()
        controller.saveProfile(ProfileIdentityRequest("Name", "handle", "#6750A4"))
        runCurrent()
        controller.saveSettings(patch())
        runCurrent()

        assertEquals(
            mapOf(
                "agent-statuses" to 2,
                "provider-usage" to 1,
                "profile-devices" to 1,
                "profile-core-stats" to 1,
                "profile-token-stats" to 1,
                "profile-identity" to 1,
                "settings-read" to 1,
                "settings-write" to 1,
            ),
            calls,
        )
    }

    private fun patch(): HostSettingsPatch = HostSettingsPatch.from(
        buildJsonObject { put("titleGenFast", true) },
    )
}
