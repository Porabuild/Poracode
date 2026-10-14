package com.poracode.app.ui

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class PoracodeNavigationStateTest {
    @Test
    fun permissionGatePreservesPendingHostDestinationButClearsVisibleRoutes() {
        val navigation = PoracodeNavigationState().apply {
            showHosts = true
            showProjects = true
            pendingHostConnectionId = "connection"
            pendingHostDestination = HostDestination.Projects.name
        }

        navigation.resetForRoot(preservePendingHostDestination = true)

        assertFalse(navigation.showHosts)
        assertFalse(navigation.showProjects)
        assertEquals("connection", navigation.pendingHostConnectionId)
        assertEquals(HostDestination.Projects.name, navigation.pendingHostDestination)
    }

    @Test
    fun ordinaryRootExitClearsPendingDestinationAndSensitiveCommand() {
        val navigation = PoracodeNavigationState().apply {
            pendingHostConnectionId = "connection"
            pendingHostDestination = HostDestination.DesktopSettings.name
            projectUtilityInitialCommand = "secret command"
        }

        navigation.resetForRoot(preservePendingHostDestination = false)

        assertNull(navigation.pendingHostConnectionId)
        assertNull(navigation.pendingHostDestination)
        assertNull(navigation.projectUtilityInitialCommand)
    }

    @Test
    fun projectIntegrationRoutePreservesExactHostProjectAndInitialPage() {
        val navigation = PoracodeNavigationState()
        val identity = ProjectIdentity(
            ClientConnectionId("10000000-0000-4000-8000-000000000001"),
            "project-a",
        )

        navigation.openSettingsIntegrations(identity, SettingsIntegrationsPage.Mcp)

        assertEquals("project-a", navigation.settingsIntegrationsProjectId)
        assertEquals(identity.connectionId.value, navigation.settingsIntegrationsConnectionId)
        assertEquals(SettingsIntegrationsPage.Mcp.name, navigation.settingsIntegrationsPage)
        assertEquals(true, navigation.showSettingsIntegrations)
    }
}
