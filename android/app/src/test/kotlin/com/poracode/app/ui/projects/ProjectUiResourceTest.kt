package com.poracode.app.ui.projects

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectUiResourceTest {
    @Test
    fun projectResourcesAreCompleteInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val source = names(root.resolve("values/projects.xml"))
        assertEquals(85, source.size)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = root.resolve("values-$locale/projects.xml")
            assertTrue("Missing $locale project resources", file.isFile)
            assertEquals("Incomplete $locale project resources", source, names(file))
            val text = file.readText()
            assertFalse("Empty project translation in $locale", EMPTY.containsMatchIn(text))
            PLACEHOLDER_NAMES.forEach { name ->
                val value = STRING.findAll(text)
                    .firstOrNull { it.groupValues[1] == name }
                    ?.groupValues
                    ?.get(2)
                assertTrue("Missing placeholder in $locale/$name", value?.contains("%1\$s") == true)
            }
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

    companion object {
        private val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        private val EMPTY = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
        private val PLACEHOLDER_NAMES = setOf(
            "projects_project_row_description",
            "projects_relocate_confirm_message",
            "projects_disable_confirm_title",
            "projects_remove_confirm_title",
        )
    }
}
