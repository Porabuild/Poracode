package com.poracode.app.ui.ports

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PortForwardResourceTest {
    @Test
    fun allTwelveLocalesHaveExactNonEmptyKeyAndPlaceholderParity() {
        val root = File("src/main/res")
        val source = values(root.resolve("values/ports.xml"))
        assertEquals(26, source.size)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/ports.xml")
            assertTrue("Missing $locale port resources", file.isFile)
            val localized = values(file)
            assertEquals("Port resource key mismatch in $locale", source.keys, localized.keys)
            assertFalse("Blank port translation in $locale", localized.values.any(String::isBlank))
            source.forEach { (name, text) ->
                assertEquals(
                    "Placeholder mismatch in $locale/$name",
                    PLACEHOLDER.findAll(text).map { it.value }.toList(),
                    PLACEHOLDER.findAll(localized.getValue(name)).map { it.value }.toList(),
                )
            }
        }
    }

    private fun values(file: File): Map<String, String> = STRING.findAll(file.readText())
        .associate { match -> match.groupValues[1] to match.groupValues[2].trim() }

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val STRING = Regex("""<string name="([^"]+)">(.*?)</string>""")
        private val PLACEHOLDER = Regex("""%\d+\$[a-z]""")
    }
}
