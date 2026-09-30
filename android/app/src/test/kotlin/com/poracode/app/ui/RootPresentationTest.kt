package com.poracode.app.ui

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.session.AppSession
import com.poracode.app.ui.home.HomeProjectUtility
import com.poracode.app.ui.remoteintegrations.RemoteIntegrationsSection
import com.poracode.app.ui.settings.SettingsPane
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RootPresentationTest {
    @Test
    fun `stored sessions enter home while reconnecting`() {
        assertEquals(
            RootPresentation.Home,
            rootPresentation(AppSession.Phase.ReconnectingStored, hasProfile = true),
        )
        assertEquals(
            RootPresentation.Home,
            rootPresentation(AppSession.Phase.Connecting, hasProfile = true),
        )
    }

    @Test
    fun `first pair stays in onboarding and launch uses wordmark splash`() {
        assertEquals(
            RootPresentation.Onboarding,
            rootPresentation(AppSession.Phase.Connecting, hasProfile = false),
        )
        assertEquals(
            RootPresentation.Splash,
            rootPresentation(AppSession.Phase.Launching, hasProfile = false),
        )
    }

    @Test
    fun `paired deep link confirmation precedes every home destination`() {
        val connectionId = ClientConnectionId("10000000-0000-4000-8000-000000000001")
        val pendingPairConfirm = AppSession.PendingPairConfirmUi(
            sanitizedHost = "example.test",
            endpoint = "https://example.test",
            fingerprint = "fingerprint",
        )
        val competingDestinations = listOf<Pair<String, PoracodeNavigationState.() -> Unit>>(
            "advanced operations" to { showAdvancedOperations = true },
            "browser mirror" to { showBrowserMirror = true },
            "settings integrations" to { showSettingsIntegrations = true },
            "remote integrations" to {
                remoteIntegrationsSection = RemoteIntegrationsSection.Schedules.name
            },
            "settings" to { settingsPane = SettingsPane.Profile.name },
            "project utility" to {
                projectUtilityProjectId = "project-a"
                projectUtilityConnectionId = connectionId.value
                projectUtilityName = HomeProjectUtility.Notes.name
            },
            "projects" to { showProjects = true },
            "ports" to { showPorts = true },
            "hosts" to { showHosts = true },
            "home" to {},
        )

        competingDestinations.forEach { (name, configure) ->
            val destination = homeDestination(
                navigation = PoracodeNavigationState().apply(configure),
                pendingPairConfirm = pendingPairConfirm,
                selectedConnectionId = connectionId,
                projectUtility = HomeProjectUtility.Notes,
            )

            assertEquals(
                "Home pairing confirmation must precede $name",
                HomeDestination.PendingPair,
                destination,
            )
        }

        val root = projectFile("app/src/main/kotlin/com/poracode/app/ui")
        val app = root.resolve("PoracodeApp.kt").readText()
        val destinationContent = root.resolve("PoracodeHomeDestinations.kt").readText()
        assertTrue(
            "The Home shell must pass the live pending confirmation into its resolver",
            app.contains("pendingPairConfirm = state.pendingPairConfirm"),
        )
        assertTrue(
            "The resolved pending-pair destination must render confirmation content",
            app.contains(
                "is HomeDestination.PendingPair -> PendingPairConfirmDestinationContent(",
            ),
        )
        assertTrue(
            "The pending-pair destination must expose the confirmation action",
            destinationContent.contains("onConfirmPendingPair = confirmWithPermission"),
        )
    }

    private fun projectFile(path: String): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor.resolve(path)
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android project")
    }
}
