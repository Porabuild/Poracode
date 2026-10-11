package com.poracode.app.ui

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exact key/placeholder parity for every Git-summary string across English and
 * all 12 non-English locales — no English fallback ships in a localized catalog.
 */
class GitSummaryLocaleParityTest {
    private val locales = listOf(
        "values",
        "values-de",
        "values-es",
        "values-fr",
        "values-ja",
        "values-ko",
        "values-pl",
        "values-pt-rBR",
        "values-ru",
        "values-tr",
        "values-uk",
        "values-vi",
        "values-zh-rCN",
    )

    private val stringLine = Regex("""<string name="([^"]+)">(.*)</string>""")

    @Test
    fun everyLocaleHasExactKeySetAndNonEmptyTranslations() {
        val resDir = resDirectory()
        val byLocale = locales.associateWith { locale ->
            entries(File(resDir, "$locale/git_summary.xml"))
        }
        val english = byLocale.getValue("values").keys
        assertFalse("git_summary.xml must define strings", english.isEmpty())
        byLocale.forEach { (locale, entries) ->
            assertEquals("key set mismatch in $locale/git_summary.xml", english, entries.keys)
            entries.forEach { (key, value) ->
                assertTrue("empty translation for $key in $locale", value.isNotBlank())
                assertFalse(
                    "locale $locale left English-looking placeholder for $key",
                    value.startsWith("TODO") || value == key,
                )
                assertEquals(
                    "placeholder count mismatch for $key in $locale",
                    placeholderCount(byLocale.getValue("values").getValue(key)),
                    placeholderCount(value),
                )
            }
        }
    }

    private fun placeholderCount(value: String): Int =
        Regex("%(\\d+)\\$[ds]").findAll(value).count()

    private fun entries(file: File): Map<String, String> {
        assertTrue("missing ${file.path}", file.isFile)
        val text = file.readText()
        return stringLine.findAll(text).associate { it.groupValues[1] to it.groupValues[2] }
    }

    private fun resDirectory(): File {
        var parent = File(".").absoluteFile
        repeat(6) {
            val direct = File(parent, "src/main/res")
            if (direct.isDirectory) return direct
            val androidApp = File(parent, "android/app/src/main/res")
            if (androidApp.isDirectory) return androidApp
            parent = parent.parentFile ?: return@repeat
        }
        error("Could not locate android/app/src/main/res from ${File(".").absoluteFile}")
    }
}
