package com.poracode.app.ui.richchat

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Focused native-resource guard for the background-task surface: every new
 * string exists in the base catalog and in all 12 supported locale catalogs,
 * is non-empty, and keeps its positional placeholder.
 */
class RichChatBackgroundTaskResourceTest {
    private val keys = listOf(
        "rich_chat_background_tasks",
        "rich_chat_background_task",
        "rich_chat_background_task_monitor",
        "rich_chat_background_task_tool",
        "rich_chat_background_task_agent",
        "rich_chat_background_task_other",
        "rich_chat_background_task_output",
        "rich_chat_background_task_output_unavailable",
        "rich_chat_background_task_output_read_failed",
        "rich_chat_background_task_output_loading",
        "rich_chat_background_task_no_output",
        "rich_chat_background_task_output_truncated",
        "rich_chat_background_task_stop",
        "rich_chat_background_task_stopping",
        "rich_chat_background_task_stop_unconfirmed",
        "rich_chat_background_task_report_missing",
        "rich_chat_background_task_running_for",
        "rich_chat_background_task_last_progress",
        "rich_chat_background_task_close",
    )

    @Test
    fun backgroundTaskStringsExistInEveryLocaleWithTheirPlaceholder() {
        val root = projectFile("app/src/main/res")
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        keys.forEach { key ->
            assertCatalog(root.resolve("values/rich_chat.xml"), key, "values")
        }
        locales.forEach { locale ->
            keys.forEach { key ->
                assertCatalog(root.resolve("values-$locale/rich_chat.xml"), key, locale)
            }
        }
    }

    private fun assertCatalog(file: File, key: String, locale: String) {
        assertTrue("Missing $locale rich_chat.xml", file.isFile)
        val values = STRING.findAll(file.readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
        val value = values[key]
        assertTrue("Missing $locale/$key", value != null)
        assertFalse("Empty $locale/$key", value.isNullOrBlank())
        if (key in PLACEHOLDER_KEYS) {
            assertTrue("Missing %1\$s in $locale/$key", "%1\$s" in value!!)
        }
    }

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
        val PLACEHOLDER_KEYS = setOf(
            "rich_chat_background_task_output_truncated",
            "rich_chat_background_task_running_for",
            "rich_chat_background_task_last_progress",
        )
    }
}
