package com.poracode.app.ui.thread

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThreadLifecycleResourceTest {
    @Test
    fun lifecycleResourcesAreCompleteInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val source = names(root.resolve("values/thread_lifecycle.xml"))
        assertTrue(source.size >= 20)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = root.resolve("values-$locale/thread_lifecycle.xml")
            assertTrue("Missing $locale lifecycle resources", file.isFile)
            assertEquals("Incomplete $locale lifecycle resources", source, names(file))
            assertFalse("Empty lifecycle translation in $locale", EMPTY.containsMatchIn(file.readText()))
        }
    }

    private fun names(file: File): Set<String> = STRING.findAll(file.readText())
        .map { it.groupValues[1] }
        .toSet()

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
        val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        val EMPTY = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
    }
}
