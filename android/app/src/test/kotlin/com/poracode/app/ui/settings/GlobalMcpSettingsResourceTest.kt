package com.poracode.app.ui.settings

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlobalMcpSettingsResourceTest {
    @Test
    fun globalMcpResourcesAreCompleteInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val source = values(root.resolve("values/global_mcp.xml"))
        assertEquals(48, source.size)
        LOCALES.forEach { locale ->
            val localized = values(root.resolve("values-$locale/global_mcp.xml"))
            assertEquals("Incomplete $locale MCP settings", source.keys, localized.keys)
            assertFalse("Empty $locale MCP settings", localized.values.any(String::isBlank))
            assertTrue(localized.getValue("settings_global_mcp_probe_summary").contains("%1\$s"))
            assertTrue(localized.getValue("settings_global_mcp_probe_summary").contains("%2\$d"))
            assertTrue(localized.getValue("settings_global_mcp_probe_summary").contains("%3\$d"))
        }
    }

    private fun values(file: File): Map<String, String> = STRING.findAll(file.readText())
        .associate { it.groupValues[1] to it.groupValues[2] }

    private fun projectFile(path: String): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor.resolve(path)
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android root for $path")
    }

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
    }
}
