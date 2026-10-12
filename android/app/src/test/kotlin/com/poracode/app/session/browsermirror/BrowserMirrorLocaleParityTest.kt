package com.poracode.app.session.browsermirror

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies exact key/placeholder parity for every browser-mirror string across English and
 * all 12 non-English locales — no English fallback translations ship in a localized catalog.
 */
class BrowserMirrorLocaleParityTest {
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
            entries(File(resDir, "$locale/browser_mirror.xml"))
        }

        val english = byLocale.getValue("values").keys
        assertFalse("browser_mirror.xml must define strings", english.isEmpty())

        byLocale.forEach { (locale, entries) ->
            assertEquals(
                "key set mismatch in $locale/browser_mirror.xml",
                english,
                entries.keys,
            )
            entries.forEach { (key, value) ->
                assertTrue(
                    "empty translation for $key in $locale",
                    value.isNotBlank(),
                )
                assertFalse(
                    "locale $locale left English-looking placeholder for $key",
                    value.startsWith("TODO") || value == key,
                )
            }
        }
    }

    private fun entries(file: File): Map<String, String> {
        assertTrue("missing ${file.path}", file.isFile)
        val text = file.readText()
        return stringLine.findAll(text).associate { it.groupValues[1] to it.groupValues[2] }
    }

    private fun resDirectory(): File {
        var candidate = File("src/main/res")
        var parent = File(".").absoluteFile
        repeat(6) {
            val direct = File(parent, "src/main/res")
            if (direct.isDirectory) return direct
            val androidApp = File(parent, "android/app/src/main/res")
            if (androidApp.isDirectory) return androidApp
            parent = parent.parentFile ?: return@repeat
        }
        if (candidate.isDirectory) return candidate
        error("Could not locate android/app/src/main/res from ${File(".").absoluteFile}")
    }
}
