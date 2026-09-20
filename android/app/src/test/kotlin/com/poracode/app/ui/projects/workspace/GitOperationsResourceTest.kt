package com.poracode.app.ui.projects.workspace

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GitOperationsResourceTest {
    @Test
    fun everyExistingAndroidLocaleHasExactRealGitTranslations() {
        val root = androidRoot().resolve("app/src/main/res")
        val source = root.resolve("values/git_operations.xml")
        val sourceValues = values(source)
        assertTrue(sourceValues.size >= 45)
        LOCALES.forEach { locale ->
            val translated = root.resolve("values-$locale/git_operations.xml")
            assertTrue("Missing $locale Git resources", translated.isFile)
            val translatedValues = values(translated)
            assertEquals("Git resource key mismatch in $locale", sourceValues.keys, translatedValues.keys)
            assertFalse("Empty Git translation in $locale", EMPTY.containsMatchIn(translated.readText()))
            assertTrue(
                "Git resources are not genuinely translated in $locale",
                sourceValues.count { (key, value) -> translatedValues[key] != value } >=
                    sourceValues.size - 6,
            )
            PLACEHOLDER_KEYS.forEach { key ->
                assertTrue("Missing placeholder in $locale/$key", "%1\$s" in translatedValues.getValue(key))
            }
        }
    }

    private fun values(file: File): Map<String, String> = STRING.findAll(file.readText())
        .associate { it.groupValues[1] to it.groupValues[2] }

    private fun androidRoot(): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android root")
    }

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val PLACEHOLDER_KEYS = listOf("git_stage_file", "git_unstage_file", "git_revert_file")
        private val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        private val EMPTY = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
    }
}
