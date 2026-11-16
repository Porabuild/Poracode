package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichContentDecoder
import com.poracode.app.chat.RichItemTypes
import com.poracode.app.chat.readRichFixture
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class RichActivityCategoriesFixtureTest {
    @Test
    fun canonicalActivityCategoriesMatchTheSharedPwaFixture() {
        val fixture = readRichFixture("rich-activity-categories.json")
        assertEquals("1", fixture.getValue("version").jsonPrimitive.content)
        val names = mapOf(
            RichItemTypes.IMAGE_VIEW to "view", RichItemTypes.WEB_SEARCH to "search",
            RichItemTypes.FILE_CHANGE to "edit", RichItemTypes.COMMAND_EXECUTION to "command",
            RichItemTypes.MCP_TOOL_CALL to "mcp", RichItemTypes.TOOL_CALL to "tool", RichItemTypes.REASONING to "thought",
        )
        for (value in fixture.getValue("cases").jsonArray) {
            val row = value.jsonObject
            val item = RichContentDecoder.decodePersistedItems(JsonArray(listOf(row.getValue("item"))))!!.single()
            assertEquals(row.getValue("name").jsonPrimitive.content, row.getValue("category").jsonPrimitive.content, names[activityIconKey(item)])
        }
    }
}
