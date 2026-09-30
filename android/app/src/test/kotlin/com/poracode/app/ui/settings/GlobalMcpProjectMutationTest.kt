package com.poracode.app.ui.settings

import com.poracode.app.model.McpServer
import com.poracode.app.model.McpStdioTransport
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.settings.GlobalMcpSettingsCommand
import com.poracode.app.model.settings.GlobalMcpSettingsResponse
import com.poracode.app.model.settings.GlobalMcpSettingsScope
import com.poracode.app.session.settings.FakeSettingsSessionGateway
import com.poracode.app.session.settings.SettingsGatewayException
import com.poracode.app.session.settings.SettingsHostLease
import com.poracode.app.session.settings.connectionA
import com.poracode.app.session.settings.connectionB
import com.poracode.app.session.settings.lease
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GlobalMcpProjectMutationTest {
    @Test
    fun projectUpsertUsesExactProjectScopeAndReportsApplied() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(
            lease(connectionA, scopes = setOf("projects:manage")),
        )
        var captured: GlobalMcpSettingsCommand? = null
        val gateway = FakeSettingsSessionGateway().apply {
            mcpCommandHandler = { _, command ->
                captured = command
                GlobalMcpSettingsResponse(emptyList())
            }
        }
        val controller = GlobalMcpSettingsController(session, gateway, backgroundScope)
        var result: McpScopedMutationResult? = null

        controller.upsertProject(ProjectIdentity(connectionA, "project-a"), server()) {
            result = it
        }
        runCurrent()

        val command = captured as GlobalMcpSettingsCommand.Upsert
        assertEquals(GlobalMcpSettingsScope.Project("project-a"), command.scope)
        assertEquals(McpScopedMutationResult.Applied, result)
    }

    @Test
    fun projectMutationRejectsAHostMismatchBeforeCallingGateway() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(
            lease(connectionB, scopes = setOf("projects:manage")),
        )
        var calls = 0
        val gateway = FakeSettingsSessionGateway().apply {
            mcpCommandHandler = { _, _ ->
                calls += 1
                GlobalMcpSettingsResponse(emptyList())
            }
        }
        val controller = GlobalMcpSettingsController(session, gateway, backgroundScope)
        var result: McpScopedMutationResult? = null

        controller.removeProject(ProjectIdentity(connectionA, "project-a"), "server-a") {
            result = it
        }
        runCurrent()

        assertEquals(0, calls)
        assertEquals(McpScopedMutationResult.Stale, result)
    }

    @Test
    fun ambiguousProjectMutationReconcilesAndRequestsProjectReload() = runTest {
        val session = MutableStateFlow<SettingsHostLease?>(
            lease(connectionA, scopes = setOf("projects:manage")),
        )
        var reads = 0
        val gateway = FakeSettingsSessionGateway().apply {
            mcpCommandHandler = { _, _ -> throw SettingsGatewayException(0, "network", true) }
            mcpReadHandler = {
                reads += 1
                GlobalMcpSettingsResponse(emptyList())
            }
        }
        val controller = GlobalMcpSettingsController(session, gateway, backgroundScope)
        var result: McpScopedMutationResult? = null

        controller.moveProjectToGlobal(
            ProjectIdentity(connectionA, "project-a"),
            "server-a",
        ) { result = it }
        runCurrent()

        assertEquals(1, reads)
        assertEquals(McpScopedMutationResult.Uncertain, result)
        assertTrue(controller.state.value.mutationUncertain)
    }

    private fun server() = McpServer(
        id = "server-a",
        name = "tools",
        transport = McpStdioTransport("node"),
    )
}
