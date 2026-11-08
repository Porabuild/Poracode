package com.poracode.app.chat

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.poracode.app.ui.richchat.htmlVisualTheme
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class RichInlineVisualFixtureTest {
    @Test
    fun splitterMatchesTheSharedFixture() {
        val fixture = readRichFixture("rich-inline-visuals.json")
        val elision = fixture.getValue("elision").jsonObject
        assertEquals(RichInlineVisualParser.ELISION_NOTICE_PREFIX, elision.getValue("noticePrefix").jsonPrimitive.content)
        assertEquals(RichInlineVisualParser.ELISION_HEAD_UTF16_UNITS, elision.getValue("headUtf16Units").jsonPrimitive.int)
        for (entry in fixture.getValue("cases").jsonArray) {
            val case = entry.jsonObject
            val expected = case.getValue("parts").jsonArray.map { decode(it.jsonObject) }
            assertEquals(
                case.getValue("id").jsonPrimitive.content,
                expected,
                RichInlineVisualParser.split(case.getValue("text").jsonPrimitive.content),
            )
        }
    }

    @Test
    fun previewLimitsAndThemeVariablesMatchTheSharedFixture() {
        val preview = readRichFixture("rich-inline-visuals.json").getValue("preview").jsonObject
        assertEquals(RichInlineVisualParser.FORMAT_VERSION, preview.getValue("formatVersion").jsonPrimitive.int)
        assertEquals(RichInlineVisualParser.MAX_PREVIEWS_PER_MESSAGE, preview.getValue("maxPreviewsPerMessage").jsonPrimitive.int)
        assertEquals(RichInlineVisualParser.MAX_SOURCE_BYTES, preview.getValue("maxSourceUtf8Bytes").jsonPrimitive.int)
        assertEquals(RichInlineVisualParser.MIN_HEIGHT, preview.getValue("minHeight").jsonPrimitive.double, 0.0)
        assertEquals(RichInlineVisualParser.MAX_HEIGHT, preview.getValue("maxHeight").jsonPrimitive.double, 0.0)
        val names = preview.getValue("themeVariables").jsonArray.map { it.jsonPrimitive.content }.toSet()
        for ((colors, dark) in listOf(lightColorScheme() to false, darkColorScheme() to true)) {
            val theme = htmlVisualTheme(colors, dark)
            assertEquals(if (dark) "dark" else "light", theme.getValue("appearance").jsonPrimitive.content)
            assertEquals(names, theme.getValue("variables").jsonObject.keys)
        }
    }

    @Test
    fun settledRepliesBoundPreviewsAndKeepNativeSource() {
        val html = "```poracode-html-v1 Chart\n<h1>42</h1>\n```\n"
        val native = "```poracode-visual-v1 Native\n{}\n```\n"
        val blocks = RichInlineVisualParser.blocks("Intro\n${html.repeat(5)}$native", settled = true)!!
        val previews = blocks.filterIsInstance<RichInlineVisualBlock.Html>().map { it.visual }
        assertEquals(listOf(false, false, false, false, true), previews.map { it.limited })
        assertEquals(
            listOf(null, null, null, null, RichHtmlVisualPresentation.SourceOnlyReason.LIMITED),
            previews.map { it.sourceOnlyReason },
        )
        assertEquals(RichInlineVisualBlock.Markdown("Intro\n"), blocks.first())
        assertEquals(RichInlineVisualBlock.Source("poracode-visual-v1 Native", "{}\n"), blocks.last())
        assertNull(RichInlineVisualParser.blocks(html, settled = false))
        assertNull(RichInlineVisualParser.blocks("```html\n<b>x</b>\n```", settled = true))
    }

    @Test
    fun retainedHistoryWithAnElisionNoticeNeverPreviews() {
        val notice = "[... poracode elided 9 characters of earlier output ...]"
        assertNull(RichInlineVisualParser.blocks("```poracode-html-v1 Chart\n<h1>42</h1>\n$notice\n```", settled = true))
        val beyondHead = "```poracode-html-v1 Chart\n<h1>${"x".repeat(256_200)}</h1>\n```\n$notice"
        assertNotNull(RichInlineVisualParser.blocks(beyondHead, settled = true))
    }

    @Test
    fun unrenderableBlocksStaySourceAndOnlyWebLinksLeave() {
        fun reason(html: String = "<b>x</b>", version: Int = 1, complete: Boolean = true) =
            RichHtmlVisualPresentation("", html, version, complete, limited = false).sourceOnlyReason
        assertNull(reason())
        assertEquals(RichHtmlVisualPresentation.SourceOnlyReason.INCOMPLETE, reason(complete = false))
        assertEquals(RichHtmlVisualPresentation.SourceOnlyReason.UNSUPPORTED, reason(version = 2))
        assertEquals(
            RichHtmlVisualPresentation.SourceOnlyReason.TOO_LARGE,
            reason("x".repeat(RichInlineVisualParser.MAX_SOURCE_BYTES + 1)),
        )
        assertEquals("https://example.com/docs", RichInlineVisualParser.linkUrl("https://example.com/docs"))
        assertEquals(
            "https://example.com/items?filter[name]=x&q={y}#a|b",
            RichInlineVisualParser.linkUrl("https://example.com/items?filter[name]=x&q={y}#a|b"),
        )
        assertNull(RichInlineVisualParser.linkUrl("https://example.com/" + "😀".repeat(1100)))
        for (value in listOf(
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://user:secret@example.com/",
            "/relative",
            "mailto:someone@example.com",
            null,
        )) {
            assertNull(value, RichInlineVisualParser.linkUrl(value))
        }
    }

    private fun decode(part: JsonObject): RichInlineVisualPart {
        val kind = part.getValue("kind").jsonPrimitive.content
        if (kind == "markdown") return RichInlineVisualPart.Markdown(part.getValue("text").jsonPrimitive.content)
        val version = part.getValue("version").jsonPrimitive.int
        val title = part.getValue("title").jsonPrimitive.content
        val complete = part.getValue("complete").jsonPrimitive.boolean
        return if (kind == "visual") {
            RichInlineVisualPart.Visual(version, title, part.getValue("html").jsonPrimitive.content, complete)
        } else {
            RichInlineVisualPart.Native(version, title, part.getValue("source").jsonPrimitive.content, complete)
        }
    }
}
