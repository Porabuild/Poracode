package com.poracode.app.ui.richchat

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeContextResourceTest {
    @Test
    fun runtimeContextResourcesHaveTranslationsAndMatchingPlaceholders() {
        val root = projectFile("app/src/main/res")
        val sourceFile = root.resolve("values/runtime_context.xml")
        val sourceNames = strings(sourceFile).keys
        assertEquals(EXPECTED_NAMES, sourceNames)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/runtime_context.xml")
            assertTrue("Missing runtime-context resources for $locale", file.isFile)
            val translated = strings(file)
            assertEquals(
                "Incomplete runtime-context resources for $locale",
                sourceNames,
                translated.keys,
            )
            assertFalse(
                "Empty runtime-context translation for $locale",
                EMPTY.containsMatchIn(file.readText()),
            )
            PLACEHOLDERS.forEach { (name, expected) ->
                expected.forEach { placeholder ->
                    assertTrue(
                        "Missing $placeholder in $locale/$name",
                        placeholder in translated.getValue(name),
                    )
                }
            }
        }
    }

    private fun strings(file: File): Map<String, String> = STRING.findAll(file.readText())
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

    private companion object {
        val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        val EXPECTED_NAMES = setOf(
            "runtime_context_label",
            "runtime_context_usage",
            "runtime_context_show_details",
            "runtime_context_hide_details",
            "runtime_context_percent_full",
            "runtime_context_percent",
            "runtime_context_used_and_limit",
            "runtime_context_used_value",
            "runtime_context_limit_value",
            "runtime_context_used",
            "runtime_context_unknown",
            "runtime_context_provider_unreported",
            "runtime_context_summary",
            "runtime_context_compact_thousands",
            "runtime_context_compact_millions",
        )
        val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        val EMPTY = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
        val PLACEHOLDERS = mapOf(
            "runtime_context_percent_full" to listOf("%1\$d"),
            "runtime_context_percent" to listOf("%1\$d"),
            "runtime_context_used_and_limit" to listOf("%1\$s", "%2\$s"),
            "runtime_context_used_value" to listOf("%1\$s"),
            "runtime_context_limit_value" to listOf("%1\$s"),
            "runtime_context_summary" to listOf("%1\$s", "%2\$s"),
            "runtime_context_compact_thousands" to listOf("%1\$s"),
            "runtime_context_compact_millions" to listOf("%1\$s"),
        )
    }
}
