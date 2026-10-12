package com.poracode.app.ui.advancedops

import com.poracode.app.model.ClientConnectionId
import com.poracode.app.protocol.advancedops.AdvancedOperation
import com.poracode.app.ui.HomeDestination
import com.poracode.app.ui.PoracodeNavigationState
import com.poracode.app.ui.homeDestination
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancedOpsReachabilityTest {
    @Test
    fun `every advanced procedure has one typed action and localized label`() {
        assertEquals(17, AdvancedAction.entries.size)
        assertEquals(AdvancedOperation.entries.toSet(), AdvancedAction.entries.map { it.operation }.toSet())
        AdvancedAction.entries.forEach { action ->
            assertTrue("Missing fields for ${action.name}", action.fields.isNotEmpty())
        }
        assertEquals(25, AdvancedField.entries.size)
        assertEquals(25, AdvancedField.entries.map(AdvancedField::labelResource).distinct().size)
    }

    @Test
    fun `settings navigation reaches the production advanced screen`() {
        val root = projectFile("app/src/main/kotlin/com/poracode/app/ui")
        val app = root.resolve("PoracodeApp.kt").readText()
        val destination = root.resolve("HomeDestination.kt").readText()
        val destinationContent = root.resolve("PoracodeHomeDestinations.kt").readText()
        val settings = root.resolve("settings/SettingsScreen.kt").readText()
        val navigation = PoracodeNavigationState().apply { showAdvancedOperations = true }

        assertEquals(
            HomeDestination.AdvancedOperations,
            homeDestination(
                navigation = navigation,
                pendingPairConfirm = null,
                selectedConnectionId = ClientConnectionId(
                    "10000000-0000-4000-8000-000000000001",
                ),
                projectUtility = null,
            ),
        )
        assertTrue(
            "Settings must expose the advanced-operations navigation action",
            settings.contains("onOpenAdvanced = onOpenAdvancedOperations"),
        )
        assertTrue(
            "The settings action must activate the typed advanced destination",
            destinationContent.contains("onOpenAdvancedOperations = {") &&
                destinationContent.contains("navigation.showAdvancedOperations = true"),
        )
        assertTrue(
            "The destination resolver must map that state to AdvancedOperations",
            destination.contains(
                "if (navigation.showAdvancedOperations) return HomeDestination.AdvancedOperations",
            ),
        )
        assertTrue(
            "The Home shell must dispatch the typed advanced destination",
            app.contains(
                "is HomeDestination.AdvancedOperations -> AdvancedOperationsDestinationContent(",
            ),
        )
        assertTrue(
            "The advanced destination must render the production screen",
            destinationContent.contains("AdvancedOperationsScreen("),
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
