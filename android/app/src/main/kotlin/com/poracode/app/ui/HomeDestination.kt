package com.poracode.app.ui

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.session.AppSession
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsSection
import com.poracode.app.ui.settings.SettingsPane
import com.poracode.app.ui.settingsintegrations.SettingsIntegrationsPage

/**
 * Stable content key for [HomeDestination]. Used as the `AnimatedContent` content key so
 * that changes to a destination's own parameters (e.g. the active [SettingsPane] while
 * already inside [HomeDestination.Settings]) do not retrigger a full screen transition.
 */
internal enum class HomeDestinationKind {
    Home,
    PendingPair,
    AdvancedOperations,
    BrowserMirror,
    SettingsIntegrations,
    RemoteIntegrations,
    Settings,
    ProjectUtility,
    Projects,
    Ports,
    Hosts,
}

/**
 * A resolved, immutable snapshot of "what the Home root should show right now". Every
 * branch's identity parameters are carried on the destination value itself rather than
 * read live from [PoracodeNavigationState] so that `AnimatedContent` can keep composing
 * the outgoing destination during its exit transition after navigation state has already
 * moved on (see the `homeDestination` doc below for the crash this avoids).
 */
internal sealed interface HomeDestination {
    val kind: HomeDestinationKind
    val depth: Int

    data object PendingPair : HomeDestination {
        override val kind = HomeDestinationKind.PendingPair
        override val depth = 0
    }

    data object AdvancedOperations : HomeDestination {
        override val kind = HomeDestinationKind.AdvancedOperations
        override val depth = 2
    }

    data object BrowserMirror : HomeDestination {
        override val kind = HomeDestinationKind.BrowserMirror
        override val depth = 2
    }

    data class SettingsIntegrations(
        val identity: ProjectIdentity?,
        val page: SettingsIntegrationsPage,
    ) : HomeDestination {
        override val kind = HomeDestinationKind.SettingsIntegrations
        override val depth = 2
    }

    data class RemoteIntegrations(
        val section: RemoteIntegrationsSection,
        val connectionId: String?,
    ) : HomeDestination {
        override val kind = HomeDestinationKind.RemoteIntegrations
        override val depth = 2
    }

    data class Settings(
        val pane: SettingsPane?,
        val connectionId: String?,
    ) : HomeDestination {
        override val kind = HomeDestinationKind.Settings
        override val depth = 1
    }

    data class ProjectUtility(
        val projectId: String,
        val connectionId: String,
        val utility: HomeProjectUtility,
        val initialCommand: String?,
    ) : HomeDestination {
        override val kind = HomeDestinationKind.ProjectUtility
        override val depth = 1
    }

    data object Projects : HomeDestination {
        override val kind = HomeDestinationKind.Projects
        override val depth = 1
    }

    data object Ports : HomeDestination {
        override val kind = HomeDestinationKind.Ports
        override val depth = 1
    }

    data object Hosts : HomeDestination {
        override val kind = HomeDestinationKind.Hosts
        override val depth = 1
    }

    data object Home : HomeDestination {
        override val kind = HomeDestinationKind.Home
        override val depth = 0
    }
}

/**
 * Pure resolver reproducing the exact priority order the old `PoracodeApp` if/else chain
 * used to pick the visible Home destination. Priority order is load-bearing:
 *
 * 1. [pendingPairConfirm] must win over every other destination. A browsable pairing
 *    confirmation can arrive while the user is deep inside any nested page (settings,
 *    project utility, etc); if a lower-priority branch were checked first, the
 *    confirmation would be accepted by the session but stay hidden behind that page.
 * 2. Every other branch mirrors the original nesting order: advanced operations, browser
 *    mirror, settings integrations, remote integrations, settings, project utility,
 *    projects, ports, hosts, and finally the plain home screen.
 *
 * Each destination resolves its own identity parameters (fallback pane/page/section
 * choices included) at resolve time, so the returned value is a complete, self-contained
 * snapshot — callers must not need to re-read [navigation] to render it.
 */
internal fun homeDestination(
    navigation: PoracodeNavigationState,
    pendingPairConfirm: AppSession.PendingPairConfirmUi?,
    selectedConnectionId: ClientConnectionId?,
    projectUtility: HomeProjectUtility?,
): HomeDestination {
    if (pendingPairConfirm != null) return HomeDestination.PendingPair
    if (navigation.showAdvancedOperations) return HomeDestination.AdvancedOperations
    if (navigation.showBrowserMirror) return HomeDestination.BrowserMirror
    if (navigation.showSettingsIntegrations) {
        val identity = navigation.settingsIntegrationsProjectId?.let { projectId ->
            navigation.settingsIntegrationsConnectionId?.let { connectionId ->
                ProjectIdentity(ClientConnectionId(connectionId), projectId)
            }
        }
        val page = SettingsIntegrationsPage.entries.firstOrNull {
            it.name == navigation.settingsIntegrationsPage
        } ?: SettingsIntegrationsPage.Skills
        return HomeDestination.SettingsIntegrations(identity, page)
    }
    if (navigation.remoteIntegrationsSection != null) {
        val section = RemoteIntegrationsSection.entries.firstOrNull {
            it.name == navigation.remoteIntegrationsSection
        } ?: RemoteIntegrationsSection.Update
        return HomeDestination.RemoteIntegrations(
            section = section,
            connectionId = navigation.remoteIntegrationsConnectionId,
        )
    }
    if (navigation.settingsPane != null) {
        val pane = SettingsPane.entries.firstOrNull { it.name == navigation.settingsPane }
        return HomeDestination.Settings(pane = pane, connectionId = navigation.settingsConnectionId)
    }
    val projectUtilityProjectId = navigation.projectUtilityProjectId
    val projectUtilityConnectionId = navigation.projectUtilityConnectionId
    // Both ids must be present: `projectUtilityConnectionId == selectedConnectionId?.value` also
    // holds when BOTH are null, and the utility screens cannot address a host in that state.
    if (
        projectUtilityProjectId != null &&
        projectUtilityConnectionId != null &&
        projectUtilityConnectionId == selectedConnectionId?.value &&
        projectUtility != null
    ) {
        return HomeDestination.ProjectUtility(
            projectId = projectUtilityProjectId,
            connectionId = projectUtilityConnectionId,
            utility = projectUtility,
            initialCommand = navigation.projectUtilityInitialCommand,
        )
    }
    if (navigation.showProjects) return HomeDestination.Projects
    if (navigation.showPorts) return HomeDestination.Ports
    if (navigation.showHosts) return HomeDestination.Hosts
    return HomeDestination.Home
}
