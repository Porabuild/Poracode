package com.poracode.app.ui.settings

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsUiResourceTest {
    @Test
    fun settingsResourcesMatchInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val source = values(root.resolve("values/settings_strings.xml"))
        assertEquals(88, source.size)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/settings_strings.xml")
            assertTrue("Missing $locale settings resources", file.isFile)
            val localized = values(file)
            assertEquals("Incomplete $locale settings resources", source.keys, localized.keys)
            assertFalse(
                "Empty settings translation in $locale",
                localized.values.any(String::isBlank),
            )
            PLACEHOLDERS.forEach { (name, values) ->
                values.forEach { placeholder ->
                    assertTrue(
                        "Missing $placeholder in $locale/$name",
                        localized.getValue(name).contains(placeholder),
                    )
                }
            }
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
        private const val DOLLAR = '$'
        private val PLACEHOLDERS = mapOf(
            "settings_protocol_value" to listOf("%1${DOLLAR}d"),
            "settings_agent_description" to
                listOf("%1${DOLLAR}s", "%2${DOLLAR}s", "%3${DOLLAR}s"),
            "settings_usage_meter_description" to listOf("%1${DOLLAR}s", "%2${DOLLAR}s"),
            "settings_profile_days" to listOf("%1${DOLLAR}s"),
            "settings_profile_current_device" to listOf("%1${DOLLAR}s"),
        )
    }
}
