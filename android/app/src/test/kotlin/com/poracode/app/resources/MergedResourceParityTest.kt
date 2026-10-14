package com.poracode.app.resources

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Global guard across every base values resource file. Any translatable base string or
 * plural that is referenced by the app must resolve in every supported locale once the resources
 * are merged. This keeps the merged key/plural-set parity invariant enforced at the repository
 * level so a future base addition cannot silently ship without translations.
 */
class MergedResourceParityTest {
    @Test
    fun everyTranslatableBaseStringExistsInEveryLocale() {
        val root = androidRes()
        val baseStrings = baseTranslatableStrings(root.resolve("values"))
        assertTrue("Expected base string resources to exist", baseStrings.isNotEmpty())

        LOCALES.forEach { locale ->
            val localized = mergedStrings(root.resolve("values-$locale"))
            baseStrings.forEach { key ->
                assertTrue(
                    "Base string '$key' is missing from merged $locale resources",
                    key in localized,
                )
            }
        }
    }

    @Test
    fun everyBasePluralIsDefinedInEveryLocale() {
        val root = androidRes()
        val basePlurals = basePlurals(root.resolve("values"))
        assertTrue("Expected at least one base plural resource", basePlurals.isNotEmpty())

        LOCALES.forEach { locale ->
            val localized = mergedPlurals(root.resolve("values-$locale"))
            basePlurals.forEach { (name, _) ->
                val localeQuantities = localized[name]
                assertTrue(
                    "Base plural '$name' is missing from merged $locale resources",
                    localeQuantities != null,
                )
                // CLDR cardinal categories differ per locale (e.g. ja/zh/ko/vi only use "other",
                // Slavic locales use one/few/many/other), so we require only that the locale
                // defines the plural with a non-empty quantity set of its own.
                assertTrue(
                    "Plural '$name' has no quantities in $locale",
                    !localeQuantities.isNullOrEmpty(),
                )
            }
        }
    }

    @Test
    fun noBaseResourceFileSuppressesMissingTranslation() {
        val baseDir = androidRes().resolve("values")
        baseDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .forEach { file ->
                assertFalse(
                    "${file.name} must not carry a broad MissingTranslation suppression",
                    "MissingTranslation" in file.readText(),
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

    private fun baseTranslatableStrings(valuesDir: File): Set<String> =
        valuesDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .flatMap { stringEntries(it) }
            .filterNot { it.nonTranslatable }
            .map { it.name }
            .toSet()

    private fun mergedStrings(localeDir: File): Map<String, String> =
        localeDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .flatMap { stringEntries(it) }
            .associate { it.name to it.value }

    private fun basePlurals(valuesDir: File): Map<String, Set<String>> =
        valuesDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .flatMap { pluralEntries(it) }
            .associate { it.name to it.quantities }

    private fun mergedPlurals(localeDir: File): Map<String, Set<String>> =
        localeDir
            .listFiles { f -> f.isFile && f.extension.equals("xml", ignoreCase = true) }
            .orEmpty()
            .flatMap { pluralEntries(it) }
            .associate { it.name to it.quantities }

    private fun stringEntries(file: File): List<StringEntry> {
        if (!file.isFile) return emptyList()
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = document.getElementsByTagName("string")
        return (0 until nodes.length).map { index ->
            val node = nodes.item(index)
            StringEntry(
                name = node.attributes.getNamedItem("name").nodeValue,
                value = node.textContent,
                nonTranslatable = node.attributes.getNamedItem("translatable")?.nodeValue == "false",
            )
        }
    }

    private fun pluralEntries(file: File): List<PluralEntry> {
        if (!file.isFile) return emptyList()
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = document.getElementsByTagName("plurals")
        return (0 until nodes.length).map { index ->
            val plurals = nodes.item(index)
            val name = plurals.attributes.getNamedItem("name").nodeValue
            val itemNodes = plurals.childNodes
            val quantities = (0 until itemNodes.length).mapNotNull { i ->
                val child = itemNodes.item(i)
                if (child.nodeName == "item") {
                    child.attributes.getNamedItem("quantity")?.nodeValue
                } else {
                    null
                }
            }.toSet()
            PluralEntry(name, quantities)
        }
    }

    private data class StringEntry(val name: String, val value: String, val nonTranslatable: Boolean)
    private data class PluralEntry(val name: String, val quantities: Set<String>)

    private companion object {
        val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
    }
}
