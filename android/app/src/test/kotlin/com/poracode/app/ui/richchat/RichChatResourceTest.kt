package com.poracode.app.ui.richchat

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatResourceTest {
    @Test
    fun richChatResourcesAreCompleteInEverySupportedLocale() {
        val root = projectFile("app/src/main/res")
        val source = names(root.resolve("values/rich_chat.xml"))
        assertTrue(source.size >= 60)
        val locales = listOf(
            "de", "es", "fr", "ja", "ko", "pl", "pt-rBR", "ru", "tr", "uk", "vi", "zh-rCN",
        )
        locales.forEach { locale ->
            val file = root.resolve("values-$locale/rich_chat.xml")
            assertTrue("Missing $locale rich-chat resources", file.isFile)
            assertEquals("Incomplete $locale rich-chat resources", source, names(file))
            val text = file.readText()
            assertFalse("Empty rich-chat translation in $locale", EMPTY.containsMatchIn(text))
            PLACEHOLDERS.forEach { (name, values) ->
                val translated = STRING.findAll(text)
                    .firstOrNull { it.groupValues[1] == name }
                    ?.groupValues
                    ?.get(2)
                    .orEmpty()
                values.forEach { placeholder ->
                    assertTrue("Missing $placeholder in $locale/$name", placeholder in translated)
                }
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

    private companion object {
        val STRING = Regex("""<string\s+name="([^"]+)"[^>]*>(.*?)</string>""")
        val EMPTY = Regex("""<string\s+name="[^"]+"\s*>\s*</string>""")
        val PLACEHOLDERS = mapOf(
            "rich_chat_remove_attachment" to listOf("%1\$s"),
            "rich_chat_activity_group" to listOf("%1\$d"),
            "rich_chat_item_description" to listOf("%1\$s", "%2\$s"),
            "rich_chat_checkpoint_summary" to listOf("%1\$s", "%2\$d"),
        )
    }
}
