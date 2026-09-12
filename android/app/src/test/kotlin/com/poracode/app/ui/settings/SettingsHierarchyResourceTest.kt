package com.poracode.app.ui.settings

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsHierarchyResourceTest {
    @Test
    fun hierarchyAndHostResourcesMatchInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val settings = values(root.resolve("values/settings_hierarchy.xml"))
        assertEquals(50, settings.size)
        val hosts = values(root.resolve("values/hosts.xml"))
        assertEquals(7, hosts.size)
        LOCALES.forEach { locale ->
            val localizedSettings = values(root.resolve("values-$locale/settings_hierarchy.xml"))
            assertEquals("Incomplete $locale settings", settings.keys, localizedSettings.keys)
            assertFalse("Empty $locale settings", localizedSettings.values.any(String::isBlank))
            val localizedHosts = values(root.resolve("values-$locale/hosts.xml"))
            assertTrue("Incomplete $locale hosts", localizedHosts.keys.containsAll(hosts.keys))
            assertFalse(
                "Empty new $locale hosts",
                hosts.keys.any { localizedHosts.getValue(it).isBlank() },
            )
        }
        LOCALES.forEach { locale ->
            assertTrue(
                values(root.resolve("values-$locale/settings_hierarchy.xml"))
                    .getValue("settings_text_size_sp").contains("%1\$d"),
            )
            assertTrue(
                values(root.resolve("values-$locale/hosts.xml"))
                    .getValue("hosts_more_actions").contains("%1\$s"),
            )
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
