package com.poracode.app.ui.advancedops

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancedOpsResourceTest {
    @Test
    fun `all thirteen catalogs have exact nonempty key and placeholder parity`() {
        val root = projectFile("app/src/main/res")
        val source = values(root.resolve("values/advanced_operations.xml"))
        assertEquals(83, source.size)
        LOCALES.forEach { locale ->
            val file = root.resolve("values-$locale/advanced_operations.xml")
            assertTrue("Missing $locale advanced resources", file.isFile)
            val localized = values(file)
            assertEquals("Advanced resource keys differ in $locale", source.keys, localized.keys)
            assertFalse("Blank advanced translation in $locale", localized.values.any(String::isBlank))
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
        .associate { it.groupValues[1] to it.groupValues[2].trim() }

    private fun projectFile(path: String): File {
        var cursor: File? = File(".").absoluteFile
        while (cursor != null) {
            if (cursor.resolve("settings.gradle.kts").isFile && cursor.resolve("app").isDirectory) {
                return cursor.resolve(path)
            }
            cursor = cursor.parentFile
        }
        error("Cannot locate Android project")
    }

    companion object {
        private val LOCALES = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        private val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        private val PLACEHOLDER = Regex("""%\d+\$[a-z]""")
    }
}
