package com.poracode.app.ui.richchat

import com.poracode.app.chat.RichItemState
import com.poracode.app.chat.RichRuntimeItem
import com.poracode.app.chat.RichWireRequestId
import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ThreadConfig
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichChatUiLogicTest {
    @Test
    fun generationRemainsInterruptibleAfterSendRequestCompletesWhileTurnIsOpen() {
        assertTrue(RichChatUiLogic.generationActive(setOf("send"), hasOpenTurn = false))
        assertTrue(RichChatUiLogic.generationActive(emptySet(), hasOpenTurn = true))
        assertEquals(false, RichChatUiLogic.generationActive(emptySet(), hasOpenTurn = false))
    }

    @Test
    fun goalSelectsLatestUsablePayloadAndDeclaredActions() {
        val old = goal("old", "active", listOf("pause"))
        val latest = goal("  Ship   native chat  ", "paused", listOf("resume", "clear", "future"))
        val result = RichChatUiLogic.latestGoal(listOf(old, latest))!!
        assertEquals("Ship native chat", result.objective)
        assertEquals("paused", result.status)
        assertEquals(setOf("resume", "clear"), result.availableActions)
    }

    @Test
    fun attachmentAndRequestPayloadsUseCanonicalWireShapes() {
        val attachments = listOf(UploadedAttachment("shot.png", "image/png", "/remote/a"))
        val segments = RichChatUiLogic.attachmentSegments(attachments)!!
        assertEquals("attachment", (segments[0] as JsonObject)["kind"]?.let(::text))
        assertEquals("/remote/a", (segments[0] as JsonObject)["path"]?.let(::text))

        val id = RichWireRequestId.Text("request-a")
        val resolution = RichChatUiLogic.requestResolution(id.jsonValue, "allow")
        assertEquals("requestPermission", resolution.method)
        assertEquals("allow", (resolution.response as JsonObject)["optionId"]?.let(::text))

        val multiple = RichChatUiLogic.requestResolution(
            id.jsonValue,
            listOf("read", "write", "read"),
        )
        assertEquals("read", (multiple.response as JsonObject)["optionId"]?.let(::text))
        assertEquals(
            listOf("read", "write"),
            (multiple.response as JsonObject)["optionIds"]
                ?.let { it as JsonArray }
                ?.map(::text),
        )
    }

    @Test
    fun checkpointAndRollbackPayloadsPreserveProjectLocationAndConfig() {
        val location = PosixProjectLocation("/srv/project")
        val list = RichChatUiLogic.checkpointListPayload("thread-a", location)
        val encodedLocation = list["projectLocation"] as JsonObject
        assertEquals("posix", encodedLocation["kind"]?.let(::text))
        assertEquals("/srv/project", encodedLocation["path"]?.let(::text))

        val rollback = RichChatUiLogic.rollbackPayload(
            "thread-a",
            1,
            ThreadConfig(model = "gpt-5"),
        )
        assertEquals("1", rollback["numTurns"].toString())
        assertEquals("gpt-5", (rollback["config"] as JsonObject)["model"]?.let(::text))
    }

    @Test
    fun nestedRuntimeImageReferencesAreFoundWithoutRenderingRemoteUrls() {
        val payload = buildJsonObject {
            put(
                "result",
                buildJsonObject {
                    put(
                        "__poracodeImageRef",
                        buildJsonObject {
                            put("threadId", "thread-a")
                            put("itemId", "item-a")
                            putJsonArray("path") { add(JsonPrimitive("result")) }
                            put("mime", "image/png")
                            put("bytes", 12)
                        },
                    )
                },
            )
        }
        val images = RichChatUiLogic.images(
            RichRuntimeItem("item-a", "image_view", RichItemState.COMPLETED, payload),
        )
        assertEquals(1, images.size)
        assertTrue(images.single() is RichImageSource.Runtime)
        assertNotNull((images.single() as RichImageSource.Runtime).ref)
    }

    private fun goal(objective: String, status: String, actions: List<String>) = RichRuntimeItem(
        id = "goal-$objective",
        type = "goal",
        state = RichItemState.COMPLETED,
        payload = buildJsonObject {
            put("objective", objective)
            put("status", status)
            putJsonArray("availableActions") { actions.forEach { action -> add(JsonPrimitive(action)) } }
        },
    )

    private fun text(value: kotlinx.serialization.json.JsonElement): String =
        (value as JsonPrimitive).content
}
