package com.poracode.app.ui.projects.workspace

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectWorkspaceResourceTest {
    @Test
    fun workspaceResourcesAreCompleteInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val sourceFile = root.resolve("values/project_workspace.xml")
        val source = names(sourceFile)
        val sourceValues = values(sourceFile)
        assertTrue("Workspace copy unexpectedly incomplete", source.size >= 65)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = root.resolve("values-$locale/project_workspace.xml")
            assertTrue("Missing $locale workspace resources", file.isFile)
            assertEquals("Incomplete $locale workspace resources", source, names(file))
            val text = file.readText()
            assertFalse("Empty workspace translation in $locale", EMPTY.containsMatchIn(text))
            val translatedValues = values(file)
            val translatedCount = source.count { name ->
                translatedValues[name] != sourceValues[name]
            }
            assertTrue(
                "Workspace resources are mostly untranslated in $locale",
                translatedCount >= source.size - LANGUAGE_INVARIANT_LIMIT,
            )
            PLACEHOLDERS.forEach { (name, expected) ->
                val value = STRING.findAll(text)
                    .firstOrNull { it.groupValues[1] == name }
                    ?.groupValues
                    ?.get(2)
                    .orEmpty()
                expected.forEach { placeholder ->
                    assertTrue("Missing $placeholder in $locale/$name", placeholder in value)
                }
            }
        }
    }

    private fun names(file: File): Set<String> = STRING.findAll(file.readText())
        .map { it.groupValues[1] }
        .toSet()

    private fun values(file: File): Map<String, String> = STRING.findAll(file.readText())
        .associate { it.groupValues[1] to it.groupValues[2] }

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
        private const val LANGUAGE_INVARIANT_LIMIT = 5
        private val PLACEHOLDERS = mapOf(
            "workspace_search_summary" to listOf("%1\$d", "%2\$d"),
            "workspace_open_folder_description" to listOf("%1\$s"),
            "workspace_open_file_description" to listOf("%1\$s"),
            "workspace_discard_message" to listOf("%1\$s"),
            "workspace_branch" to listOf("%1\$s"),
            "workspace_ahead_behind" to listOf("%1\$d", "%2\$d"),
            "workspace_change_totals" to listOf("%1\$d", "%2\$d"),
            "workspace_conflicts" to listOf("%1\$d"),
            "workspace_change_description" to listOf("%1\$s", "%2\$s", "%3\$s"),
        )
    }
}
