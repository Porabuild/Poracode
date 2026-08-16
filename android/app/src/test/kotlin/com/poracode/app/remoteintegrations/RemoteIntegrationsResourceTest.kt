package com.poracode.app.remoteintegrations

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteIntegrationsResourceTest {
    @Test
    fun allLocalesHaveExactNonEmptyKeyAndPlaceholderParity() {
        val root = androidRoot().resolve("app/src/main/res")
        val source = values(root.resolve("values/remote_integrations.xml"))
        assertEquals(100, source.size)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/remote_integrations.xml")
            assertTrue("Missing $locale", file.isFile)
            val localized = values(file)
            assertEquals("Key mismatch in $locale", source.keys, localized.keys)
            assertFalse("Blank translation in $locale", localized.values.any(String::isBlank))
            source.forEach { (key, value) ->
                assertEquals(
                    "Placeholder mismatch in $locale/$key",
                    PLACEHOLDER.findAll(value).map { it.value }.toList(),
                    PLACEHOLDER.findAll(localized.getValue(key)).map { it.value }.toList(),
                )
            }
        }
    }

    private fun values(file: File): Map<String, String> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val nodes = document.getElementsByTagName("string")
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

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val PLACEHOLDER = Regex("%\\d+[$][sd]")
    }
}
