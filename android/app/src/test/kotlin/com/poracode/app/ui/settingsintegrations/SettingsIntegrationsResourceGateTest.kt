package com.poracode.app.ui.settingsintegrations

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsIntegrationsResourceGateTest {
    @Test
    fun dedicatedResourcesAreCompleteInAllThirteenLocales() {
        val root = androidRoot().resolve("app/src/main/res")
        val source = values(root.resolve("values/settings_integrations.xml"))
        assertEquals(57, source.size)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/settings_integrations.xml")
            assertTrue("Missing settings integrations resources for $locale", file.isFile)
            val localized = values(file)
            assertEquals("Incomplete settings integrations resources for $locale", source.keys, localized.keys)
            assertFalse("Empty settings integrations translation for $locale", localized.values.any(String::isBlank))
            PLACEHOLDERS.forEach { (name, placeholders) ->
                placeholders.forEach { placeholder ->
                    assertTrue("Missing $placeholder in $locale/$name", localized.getValue(name).contains(placeholder))
                }
            }
        }
    }

    @Test
    fun sliceProductionFilesStayBelowFiveHundredLinesAndGeneratedNamesStayIsolated() {
        val root = androidRoot().resolve("app/src/main/kotlin/com/poracode/app")
        val directories = listOf("protocol", "transport", "session", "ui").map {
            root.resolve("$it/settingsintegrations")
        }
        directories.flatMap { it.listFiles()?.toList().orEmpty() }.filter { it.extension == "kt" }
            .forEach { file ->
                assertTrue("${file.name} must stay below 500 lines", file.readLines().size < 500)
                if (file.name != "GeneratedRemoteV3SettingsIntegrationsContract.kt") {
                    assertFalse(
                        "Generated symbols leaked into ${file.name}",
                        Regex("Procedure[A-Za-z0-9]+_[0-9a-f]{10}").containsMatchIn(file.readText()),
                    )
                }
            }
    }

    private fun values(file: File) = STRING.findAll(file.readText()).associate {
        it.groupValues[1] to it.groupValues[2]
    }

    private fun androidRoot(): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) return cursor
            cursor = cursor.parentFile
        }
        error("Cannot locate Android root")
    }

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        private const val DOLLAR = '$'
        private val PLACEHOLDERS = mapOf(
            "settings_integrations_delete_message" to listOf("%1${DOLLAR}s"),
            "settings_integrations_security_grade" to listOf("%1${DOLLAR}s"),
            "settings_integrations_probe_available" to listOf("%1${DOLLAR}d", "%2${DOLLAR}d"),
        )
    }
}
