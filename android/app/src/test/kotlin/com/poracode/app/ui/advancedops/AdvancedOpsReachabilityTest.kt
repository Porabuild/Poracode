package com.poracode.app.ui.advancedops

import com.poracode.app.protocol.advancedops.AdvancedOperation
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
        val settings = root.resolve("settings/SettingsScreen.kt").readText()
        assertTrue(app.contains("AdvancedOperationsScreen("))
        assertTrue(app.contains("onOpenAdvancedOperations"))
        assertTrue(settings.contains("onOpenAdvancedOperations"))
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
