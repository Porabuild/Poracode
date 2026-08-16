package com.poracode.app.ui.projects.workspace

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectGithubResourceTest {
    @Test
    fun allTwelveLocalesHaveExactNonEmptyKeyAndPlaceholderParity() {
        val root = androidRoot().resolve("app/src/main/res")
        val source = values(root.resolve("values/github_operations.xml"))
        assertEquals(39, source.size)
        locales.forEach { locale ->
            val file = root.resolve("values-$locale/github_operations.xml")
            assertTrue("Missing $locale", file.isFile)
            val localized = values(file)
            assertEquals("Key mismatch in $locale", source.keys, localized.keys)
            assertFalse("Blank translation in $locale", localized.values.any(String::isBlank))
            source.forEach { (key, value) ->
                assertEquals(
                    "Placeholder mismatch in $locale/$key",
                    placeholder.findAll(value).map { it.value }.toList(),
                    placeholder.findAll(localized.getValue(key)).map { it.value }.toList(),
                )
            }
        }
    }

    private fun values(file: File): Map<String, String> {
        val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
            .getElementsByTagName("string")
        return (0 until nodes.length).associate { index ->
            val node = nodes.item(index)
            node.attributes.getNamedItem("name").nodeValue to node.textContent
        }
    }

    private fun androidRoot(): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) return cursor
            cursor = cursor.parentFile
        }
        error("Android root not found")
    }

    private companion object {
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        val placeholder = Regex("%\\d+[$][sd]")
    }
}
