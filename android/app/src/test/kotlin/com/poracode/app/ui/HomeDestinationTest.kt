package com.poracode.app.ui

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.AppSession
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsSection
import com.poracode.app.ui.settings.SettingsPane
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeDestinationTest {
    private val connectionId = ClientConnectionId("10000000-0000-4000-8000-000000000001")

    private fun pendingPairConfirm() = AppSession.PendingPairConfirmUi(
        sanitizedHost = "example.test",
        endpoint = "https://example.test",
        fingerprint = "fp",
    )

    @Test
    fun pendingPairConfirmWinsOverEveryOtherDestination() {
        val navigation = PoracodeNavigationState().apply {
            showAdvancedOperations = true
            showBrowserMirror = true
            showSettingsIntegrations = true
            remoteIntegrationsSection = RemoteIntegrationsSection.Schedules.name
            settingsPane = SettingsPane.Profile.name
            showProjects = true
            showPorts = true
            showHosts = true
        }

        val destination = homeDestination(
            navigation = navigation,
            pendingPairConfirm = pendingPairConfirm(),
            selectedConnectionId = connectionId,
            projectUtility = null,
        )

        assertEquals(HomeDestination.PendingPair, destination)
        assertEquals(0, destination.depth)
    }

    @Test
    fun advancedOperationsBeatsEverythingBelowIt() {
        val navigation = PoracodeNavigationState().apply {
            showAdvancedOperations = true
            showBrowserMirror = true
            showHosts = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.AdvancedOperations, destination)
        assertEquals(2, destination.depth)
    }

    @Test
    fun browserMirrorBeatsSettingsIntegrationsAndBelow() {
        val navigation = PoracodeNavigationState().apply {
            showBrowserMirror = true
            showSettingsIntegrations = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.BrowserMirror, destination)
        assertEquals(2, destination.depth)
    }

    @Test
    fun settingsIntegrationsResolvesIdentityAndDefaultsPageToSkills() {
        val navigation = PoracodeNavigationState().apply {
            showSettingsIntegrations = true
            settingsIntegrationsProjectId = "project-a"
            settingsIntegrationsConnectionId = connectionId.value
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        val expected = ProjectIdentity(connectionId, "project-a")
        assertEquals(
            HomeDestination.SettingsIntegrations(expected, SettingsIntegrationsPage.Skills),
            destination,
        )
        assertEquals(2, destination.depth)
    }

    @Test
    fun settingsIntegrationsHonorsExplicitPageAndAllowsNullIdentity() {
        val navigation = PoracodeNavigationState().apply {
            showSettingsIntegrations = true
            settingsIntegrationsPage = SettingsIntegrationsPage.Mcp.name
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(
            HomeDestination.SettingsIntegrations(null, SettingsIntegrationsPage.Mcp),
            destination,
        )
    }

    @Test
    fun remoteIntegrationsDefaultsSectionToUpdateWhenUnrecognized() {
        val navigation = PoracodeNavigationState().apply {
            remoteIntegrationsSection = "not-a-real-section"
            remoteIntegrationsConnectionId = connectionId.value
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(
            HomeDestination.RemoteIntegrations(RemoteIntegrationsSection.Update, connectionId.value),
            destination,
        )
        assertEquals(2, destination.depth)
    }

    @Test
    fun remoteIntegrationsHonorsExplicitSection() {
        val navigation = PoracodeNavigationState().apply {
            remoteIntegrationsSection = RemoteIntegrationsSection.PrWatches.name
            remoteIntegrationsConnectionId = connectionId.value
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(
            HomeDestination.RemoteIntegrations(RemoteIntegrationsSection.PrWatches, connectionId.value),
            destination,
        )
    }

    @Test
    fun settingsBeatsProjectUtilityAndBelow() {
        val navigation = PoracodeNavigationState().apply {
            settingsPane = SettingsPane.Usage.name
            settingsConnectionId = connectionId.value
            showProjects = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(
            HomeDestination.Settings(SettingsPane.Usage, connectionId.value),
            destination,
        )
        assertEquals(1, destination.depth)
    }

    @Test
    fun settingsAllowsUnresolvedPane() {
        val navigation = PoracodeNavigationState().apply {
            settingsPane = "not-a-real-pane"
            settingsConnectionId = connectionId.value
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.Settings(null, connectionId.value), destination)
    }

    @Test
    fun projectUtilityRequiresProjectIdMatchingConnectionAndResolvedUtility() {
        val navigation = PoracodeNavigationState().apply {
            projectUtilityProjectId = "project-a"
            projectUtilityConnectionId = connectionId.value
            projectUtilityName = HomeProjectUtility.Notes.name
            projectUtilityInitialCommand = "ls"
        }

        val destination = homeDestination(
            navigation = navigation,
            pendingPairConfirm = null,
            selectedConnectionId = connectionId,
            projectUtility = HomeProjectUtility.Notes,
        )

        assertEquals(
            HomeDestination.ProjectUtility(
                projectId = "project-a",
                connectionId = connectionId.value,
                utility = HomeProjectUtility.Notes,
                initialCommand = "ls",
            ),
            destination,
        )
        assertEquals(1, destination.depth)
    }

    @Test
    fun projectUtilityFallsThroughWhenConnectionIdDoesNotMatchSelectedHost() {
        val navigation = PoracodeNavigationState().apply {
            projectUtilityProjectId = "project-a"
            projectUtilityConnectionId = "some-other-connection"
            projectUtilityName = HomeProjectUtility.Notes.name
            showProjects = true
        }

        val destination = homeDestination(
            navigation = navigation,
            pendingPairConfirm = null,
            selectedConnectionId = connectionId,
            projectUtility = HomeProjectUtility.Notes,
        )

        assertEquals(HomeDestination.Projects, destination)
    }

    @Test
    fun projectUtilityFallsThroughWhenUtilityFailsToResolve() {
        val navigation = PoracodeNavigationState().apply {
            projectUtilityProjectId = "project-a"
            projectUtilityConnectionId = connectionId.value
            projectUtilityName = "not-a-real-utility"
            showPorts = true
        }

        val destination = homeDestination(
            navigation = navigation,
            pendingPairConfirm = null,
            selectedConnectionId = connectionId,
            projectUtility = null,
        )

        assertEquals(HomeDestination.Ports, destination)
    }

    @Test
    fun projectsBeatsPortsAndHosts() {
        val navigation = PoracodeNavigationState().apply {
            showProjects = true
            showPorts = true
            showHosts = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.Projects, destination)
        assertEquals(1, destination.depth)
    }

    @Test
    fun portsBeatsHosts() {
        val navigation = PoracodeNavigationState().apply {
            showPorts = true
            showHosts = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.Ports, destination)
        assertEquals(1, destination.depth)
    }

    @Test
    fun hostsResolvesWhenNothingElseIsActive() {
        val navigation = PoracodeNavigationState().apply {
            showHosts = true
        }

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.Hosts, destination)
        assertEquals(1, destination.depth)
    }

    @Test
    fun homeIsTheDefaultDestination() {
        val navigation = PoracodeNavigationState()

        val destination = homeDestination(navigation, null, connectionId, null)

        assertEquals(HomeDestination.Home, destination)
        assertEquals(0, destination.depth)
    }

    @Test
    fun everyDestinationHasAStableContentKeyMatchingItsType() {
        assertEquals(HomeDestinationKind.Home, HomeDestination.Home.kind)
        assertEquals(HomeDestinationKind.PendingPair, HomeDestination.PendingPair.kind)
        assertEquals(HomeDestinationKind.Hosts, HomeDestination.Hosts.kind)
        assertEquals(HomeDestinationKind.Projects, HomeDestination.Projects.kind)
        assertEquals(HomeDestinationKind.Ports, HomeDestination.Ports.kind)
        assertEquals(HomeDestinationKind.AdvancedOperations, HomeDestination.AdvancedOperations.kind)
        assertEquals(HomeDestinationKind.BrowserMirror, HomeDestination.BrowserMirror.kind)
        assertTrue(
            HomeDestination.Settings(null, null).kind == HomeDestinationKind.Settings,
        )
        assertNull(HomeDestination.Settings(null, null).pane)
    }
}
