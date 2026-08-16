package com.poracode.app.resources

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the app-level strings.xml resource set. The base file historically carried a broad
 * `tools:ignore="MissingTranslation"` that let every locale fall behind. These tests enforce
 * merged key/placeholder parity per locale, reject empty values and wholesale English copies,
 * and lock the suppression removal in as a regression guard.
 */
class StringsResourceTest {
    @Test
    fun everyTranslatableBaseStringIsPresentAndNonEmptyInEveryLocale() {
        val root = androidRes()
        val source = translatableStrings(root.resolve("values/strings.xml"))
        assertTrue("Expected the strings.xml base key set to be large", source.size >= 60)

        LOCALES.forEach { locale ->
            val localized = mergedStrings(root.resolve("values-$locale"))
            assertFalse("No locale resources for $locale", localized.isEmpty())
            source.keys.forEach { key ->
                assertTrue(
                    "Translatable base string '$key' is missing in $locale",
                    localized.containsKey(key),
                )
            }
            localized.entries
                .filter { it.key in source.keys }
                .forEach { (key, value) ->
                    assertTrue("Empty translation for '$key' in $locale", value.isNotBlank())
                }
        }
    }

    @Test
    fun placeholdersArePreservedExactlyInEveryLocale() {
        val root = androidRes()
        val source = translatableStrings(root.resolve("values/strings.xml"))
        LOCALES.forEach { locale ->
            val localized = mergedStrings(root.resolve("values-$locale"))
            source.forEach { (key, value) ->
                val translated = localized[key]
                assertEquals(
                    "Placeholder mismatch in $locale/$key",
                    PLACEHOLDER.findAll(value).map { it.value }.toList(),
                    PLACEHOLDER.findAll(translated ?: "").map { it.value }.toList(),
                )
            }
        }
    }

    @Test
    fun noLocaleIsAWholesaleEnglishCopy() {
        val root = androidRes()
        val source = translatableStrings(root.resolve("values/strings.xml"))
        // A small number of keys are legitimately identical across locales: pure technical
        // tokens (URL/format templates), the immutable "Poracode" brand used as a channel/
        // notification title, and shared-spelling loanwords (e.g. German "Thread"/"Status",
        // Spanish "Error", French "Message"). A locale that is mostly copied from English
        // would blow well past this bound, so the assertion still catches wholesale fallbacks.
        LOCALES.forEach { locale ->
            val localized = mergedStrings(root.resolve("values-$locale"))
            val identical = source.count { (key, value) -> localized[key] == value }
            assertTrue(
                "Locale $locale leaves too many strings identical to English ($identical)",
                identical <= MAX_ALLOWED_IDENTICAL,
            )
        }
    }

    @Test
    fun missingTranslationSuppressionIsRemovedFromBaseStrings() {
        val base = androidRes().resolve("values/strings.xml").readText()
        assertFalse(
            "strings.xml must not carry a broad MissingTranslation suppression",
            "MissingTranslation" in base,
        )
    }

    @Test
    fun appNameIsIntentionallyNonTranslatable() {
        val root = androidRes()
        val appName =
            strings(root.resolve("values/strings.xml"))
                .entries
                .firstOrNull { it.key == APP_NAME }
        assertNotNull("$APP_NAME must be defined in base strings.xml", appName)
        val raw = root.resolve("values/strings.xml").readText()
        assertTrue(
            "$APP_NAME must be marked translatable=\"false\" (immutable brand token)",
            APP_NAME_NON_TRANSLATABLE in raw,
        )
        LOCALES.forEach { locale ->
            val localized = mergedStrings(root.resolve("values-$locale"))
            assertFalse(
                "$APP_NAME must not be duplicated into $locale (it is translatable=\"false\")",
                localized.containsKey(APP_NAME),
            )
        }
    }

    private fun androidRes(): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor.resolve("app/src/main/res")
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android res root")
    }

    private fun mergedStrings(localeDir: File): Map<String, String> =
        localeDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .flatMap { strings(it).entries }
            .associate { it.key to it.value }

    private fun translatableStrings(file: File): Map<String, String> =
        stringNodes(file).filterNot { it.isNonTranslatable }.associate { it.name to it.value }

    private fun strings(file: File): Map<String, String> =
        stringNodes(file).associate { it.name to it.value }

    private fun stringNodes(file: File): List<StringEntry> {
        if (!file.isFile) return emptyList()
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        return (0 until document.getElementsByTagName("string").length).map { index ->
            val node = document.getElementsByTagName("string").item(index)
            StringEntry(
                name = node.attributes.getNamedItem("name").nodeValue,
                value = node.textContent,
                isNonTranslatable =
                    node.attributes.getNamedItem("translatable")?.nodeValue == "false",
            )
        }
    }

    private data class StringEntry(val name: String, val value: String, val isNonTranslatable: Boolean)

    private companion object {
        val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        const val APP_NAME = "app_name"
        const val APP_NAME_NON_TRANSLATABLE = "<string name=\"app_name\" translatable=\"false\">Poracode</string>"
        // Allow up to a small number of legitimately-identical entries: pure technical tokens
        // (URL/format templates), the "Poracode" brand channel/notification titles, and
        // shared-spelling loanwords. A wholesale English copy would exceed this many times over.
        const val MAX_ALLOWED_IDENTICAL = 10
        val PLACEHOLDER = Regex("%\\d+[$][sd]")
    }
}
