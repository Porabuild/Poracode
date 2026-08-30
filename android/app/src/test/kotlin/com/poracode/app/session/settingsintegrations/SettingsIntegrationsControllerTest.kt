package com.poracode.app.session.settingsintegrations

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.RemoteClientException
import com.poracode.app.protocol.settingsintegrations.McpOauthResult
import com.poracode.app.protocol.settingsintegrations.McpServer
import com.poracode.app.protocol.settingsintegrations.McpTransport
import com.poracode.app.protocol.settingsintegrations.MarketplaceInstallRequest
import com.poracode.app.protocol.settingsintegrations.SkillMarketplace
import com.poracode.app.protocol.settingsintegrations.SkillOwner
import com.poracode.app.protocol.settingsintegrations.SkillScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsIntegrationsControllerTest {
    private val owner = SkillOwner("p1", PosixProjectLocation("/repo"), 9)
    private val server = McpServer("mcp", "mcp", transport = McpTransport.Http("https://mcp.test"))

    @Test
    fun ambiguousMutationRunsOneAuthoritativeReadAndNeverReplaysMutation() = runTest {
        val fixture = fixture()
        fixture.remote.failures["deleteSkill"] = RemoteClientException("secret detail", 500, "request_failed")
        fixture.controller.deleteSkill(owner, "/skill")
        assertEquals(1, fixture.remote.calls.count { it == "deleteSkill" })
        assertEquals(1, fixture.remote.calls.count { it == "scanSkills" })
        assertTrue(fixture.controller.state.value.mutation!!.uncertain)
        assertTrue(fixture.controller.state.value.mutation!!.reconciled)
    }

    @Test
    fun latestReadWinsAndOldProjectResultCannotInstallIntoNewState() = runTest {
        val fixture = fixture()
        val blocker = CompletableDeferred<Unit>()
        fixture.remote.blocker = blocker
        val pending = async { fixture.controller.scanSkills(owner) }
        while (fixture.remote.calls.isEmpty()) kotlinx.coroutines.yield()
        fixture.session.value = fixture.session.value!!.copy(workGeneration = 10, selectedProject = owner.copy(projectGeneration = 10))
        fixture.controller.onLeaseChanged()
        blocker.complete(Unit)
        assertEquals(SettingsIntegrationsResult.Stale, pending.await())
        assertEquals(null, fixture.controller.state.value.skills)
    }

    @Test
    fun marketplaceInstallCannotCompleteForStaleHostOrProject() = runTest {
        val fixture = fixture()
        val blocker = CompletableDeferred<Unit>()
        fixture.remote.blocker = blocker
        val pending = async {
            fixture.controller.installMarketplaceSkill(
                MarketplaceInstallRequest(owner, SkillMarketplace.SkillsSh, "demo", SkillScope.Project),
            )
        }
        while (fixture.remote.calls.none { it == "installMarketplaceSkill" }) kotlinx.coroutines.yield()
        fixture.session.value = fixture.session.value!!.copy(
            sessionGeneration = 2,
            workGeneration = 10,
            selectedProject = owner.copy(projectGeneration = 10),
        )
        fixture.controller.onLeaseChanged()
        blocker.complete(Unit)
        assertEquals(SettingsIntegrationsResult.Stale, pending.await())
        assertEquals(1, fixture.remote.calls.count { it == "installMarketplaceSkill" })
        assertEquals(null, fixture.controller.state.value.mutation)
    }

    @Test
    fun oauthSupersessionBackgroundAndAuthorizationAreExplicitAndRedacted() = runTest {
        val fixture = fixture()
        fixture.remote.beginResult = McpOauthResult.Redirect("flow-secret", "https://oauth.test/?secret=raw")
        fixture.remote.blocker = null
        fixture.controller.beginMcpServerOauth(owner, server)
        val launch = fixture.controller.state.value.oauthLifecycle as OauthLifecycle.LaunchRequired
        assertFalse(launch.toString().contains("flow-secret"))
        assertFalse(launch.toString().contains("oauth.test"))

        fixture.remote.waitBlocker = CompletableDeferred()
        assertEquals("https://oauth.test/?secret=raw", fixture.controller.launchOauthAndWait(owner))
        while (fixture.remote.calls.none { it == "waitMcpServerOauth" }) kotlinx.coroutines.yield()
        fixture.controller.onBackground()
        advanceUntilIdle()
        assertEquals(OauthLifecycle.PausedInBackground, fixture.controller.state.value.oauthLifecycle)
        assertEquals(1, fixture.remote.calls.count { it == "waitMcpServerOauth" })

        fixture.remote.blocker = null
        fixture.remote.beginResult = McpOauthResult.Authorized
        fixture.controller.beginMcpServerOauth(owner, server)
        assertEquals(OauthLifecycle.Authorized, fixture.controller.state.value.oauthLifecycle)
        assertEquals(1, fixture.remote.calls.count { it == "getMcpOauthStatus" })
    }

    @Test
    fun oauthTimeoutAndActiveWaitSupersessionAreDeterministic() = runTest {
        val fixture = fixture()
        fixture.remote.beginResult = McpOauthResult.Redirect("flow-1", "https://oauth.test/one")
        fixture.controller.beginMcpServerOauth(owner, server)
        fixture.remote.waitOperation = { withTimeout(100) { delay(1_000) }; McpOauthResult.Authorized }
        fixture.controller.launchOauthAndWait(owner)
        advanceUntilIdle()
        assertEquals(OauthLifecycle.TimedOut, fixture.controller.state.value.oauthLifecycle)

        fixture.remote.waitOperation = null
        fixture.remote.waitBlocker = CompletableDeferred()
        fixture.remote.beginResult = McpOauthResult.Redirect("flow-2", "https://oauth.test/two")
        fixture.controller.beginMcpServerOauth(owner, server)
        fixture.controller.launchOauthAndWait(owner)
        while (fixture.remote.calls.count { it == "waitMcpServerOauth" } < 2) kotlinx.coroutines.yield()
        fixture.remote.waitBlocker = null
        fixture.remote.beginResult = McpOauthResult.Authorized
        fixture.controller.beginMcpServerOauth(owner, server)
        assertEquals(OauthLifecycle.Authorized, fixture.controller.state.value.oauthLifecycle)
        assertEquals(2, fixture.remote.calls.count { it == "waitMcpServerOauth" })
    }

    @Test
    fun oauthRejectsNonHttpsOrCredentialBearingAuthorizationUrlBeforeWait() = runTest {
        val fixture = fixture()
        fixture.remote.beginResult = McpOauthResult.Redirect(
            "flow-secret",
            "file:///private/host-token",
        )
        fixture.controller.beginMcpServerOauth(owner, server)

        assertEquals(null, fixture.controller.launchOauthAndWait(owner))
        assertEquals(OauthLifecycle.Failed, fixture.controller.state.value.oauthLifecycle)
        assertEquals(0, fixture.remote.calls.count { it == "waitMcpServerOauth" })

        fixture.remote.beginResult = McpOauthResult.Redirect(
            "flow-secret-2",
            "https://user:password@oauth.test/authorize",
        )
        fixture.controller.beginMcpServerOauth(owner, server)
        assertEquals(null, fixture.controller.launchOauthAndWait(owner))
        assertEquals(0, fixture.remote.calls.count { it == "waitMcpServerOauth" })
    }

    private fun kotlinx.coroutines.test.TestScope.fixture(): Fixture {
        val session = MutableStateFlow<SettingsIntegrationsLease?>(
            SettingsIntegrationsLease(
                ClientConnectionId("00000000-0000-4000-8000-000000000001"), 1, 9, 8,
                setOf("session:read", "session:operate"), true, true, owner,
            ),
        )
        val remote = FakeSettingsIntegrationsRemote()
        val gateway = GeneratedSettingsIntegrationsSessionGateway(session) { remote }
        return Fixture(session, remote, SettingsIntegrationsController(session, gateway, this))
    }

    private data class Fixture(
        val session: MutableStateFlow<SettingsIntegrationsLease?>,
        val remote: FakeSettingsIntegrationsRemote,
        val controller: SettingsIntegrationsController,
    )
}
