package com.poracode.app.protocol.browsermirror

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserSafeKey
import com.poracode.app.model.browsermirror.BrowserServerMessage
import com.poracode.app.model.browsermirror.BrowserTabPosition
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GeneratedBrowserMirrorContractTest {
    @Test
    fun validatesAllSharedHttpCommandsAndBothResponseRoots() {
        val fixture = fixture()
        val expectedState = fixture.getValue("http").jsonObject.getValue("stateResponse")
        val state = GeneratedBrowserMirrorContract.stateResponse(expectedState.toString())
        assertEquals("tab-main", state.activeTabId)
        assertEquals("Poracode — 東京", state.activeTab?.title)

        fixture.getValue("http").jsonObject.getValue("commands").jsonArray.forEach { element ->
            val case = element.jsonObject
            val request = case.getValue("request").jsonObject
            val command = command(case.getValue("id").jsonPrimitive.content, request)
            assertEquals(
                request,
                RemoteJson.parseToJsonElement(
                    GeneratedBrowserMirrorContract.commandRequest(command),
                ).jsonObject,
            )
            assertEquals(
                "tab-main",
                GeneratedBrowserMirrorContract.commandResponse(expectedState.toString()).activeTabId,
            )
        }
        assertEquals("GET", GeneratedBrowserMirrorContract.stateRoute().method)
        assertEquals("session:read", GeneratedBrowserMirrorContract.stateRoute().requiredScope)
        assertEquals("POST", GeneratedBrowserMirrorContract.commandRoute().method)
        assertEquals("session:operate", GeneratedBrowserMirrorContract.commandRoute().requiredScope)
    }

    @Test
    fun validatesEverySharedWebSocketClientAndServerVariant() {
        val webSocket = fixture().getValue("webSocket").jsonObject
        val clients = webSocket.getValue("client").jsonArray
        assertEquals(clients[0].jsonObject.getValue("message").jsonObject, json(GeneratedBrowserMirrorContract.watchMessage()))
        assertEquals(clients[1].jsonObject.getValue("message").jsonObject, json(GeneratedBrowserMirrorContract.unwatchMessage()))

        clients.drop(2).forEach { element ->
            val case = element.jsonObject
            val id = case.getValue("id").jsonPrimitive.content
            val input = input(id, case.getValue("message").jsonObject.getValue("input").jsonObject)
            // Compare semantic JSON: a whole-valued Double coordinate (e.g. 120.0) is the same
            // wire number as its integer form (120). The generated codec emits Doubles for the
            // x/y/delta fields; the canonical fixture may write either form.
            assertEquals(
                normalizeNumbers(case.getValue("message").jsonObject),
                normalizeNumbers(json(GeneratedBrowserMirrorContract.inputMessage(input))),
            )
        }

        val servers = webSocket.getValue("server").jsonArray
        assertTrue(GeneratedBrowserMirrorContract.serverMessage(message(servers, "state")) is BrowserServerMessage.State)
        val frame = GeneratedBrowserMirrorContract.serverMessage(message(servers, "frame"))
            as BrowserServerMessage.Frame
        assertEquals("tab-main", frame.frame.tabId)
        assertEquals(1280.0, frame.frame.metadata.deviceWidth, 0.0)
        listOf("status-starting", "status-active", "status-unavailable").forEach { id ->
            assertTrue(
                GeneratedBrowserMirrorContract.serverMessage(message(servers, id))
                    is BrowserServerMessage.Status,
            )
        }
    }

    @Test
    fun rejectsUnknownOrMalformedMessagesWithoutReflectingPayload() {
        val secret = "secret-browser-url"
        val failures = listOf(
            runCatching { GeneratedBrowserMirrorContract.serverMessage("""{"type":"future","url":"$secret"}""") }.exceptionOrNull(),
            runCatching { GeneratedBrowserMirrorContract.serverMessage("""{"type":"browser-frame","data":"$secret"}""") }.exceptionOrNull(),
            runCatching { GeneratedBrowserMirrorContract.stateResponse("""{"state":{"tabs":[],"activeTabId":"missing"}}""") }.exceptionOrNull(),
        )
        failures.forEach {
            assertTrue(it is RemoteClientException)
            assertFalse(it?.message.orEmpty().contains(secret))
        }
    }

    private fun command(id: String, value: JsonObject): BrowserCommand = when (id) {
        "create-empty" -> BrowserCommand.CreateTab()
        "create-url" -> BrowserCommand.CreateTab(value.string("url"))
        "close" -> BrowserCommand.CloseTab(value.string("tabId"))
        "activate" -> BrowserCommand.ActivateTab(value.string("tabId"))
        "move-before", "move-after" -> BrowserCommand.MoveTab(
            value.string("tabId"),
            value.string("targetTabId"),
            if (value.string("position") == "before") BrowserTabPosition.Before else BrowserTabPosition.After,
        )
        "navigate" -> BrowserCommand.Navigate(value.string("tabId"), value.string("url"))
        "back" -> BrowserCommand.Back(value.string("tabId"))
        "forward" -> BrowserCommand.Forward(value.string("tabId"))
        "reload" -> BrowserCommand.Reload(value.string("tabId"))
        else -> error("Unknown fixture command $id")
    }

    private fun input(id: String, value: JsonObject): BrowserInput = when (id) {
        "tap" -> BrowserInput.Tap(value.number("x"), value.number("y"))
        "scroll" -> BrowserInput.Scroll(
            value.number("x"),
            value.number("y"),
            value.number("deltaX"),
            value.number("deltaY"),
        )
        "insert-unicode" -> BrowserInput.InsertText(value.string("text"))
        else -> BrowserInput.Key(checkNotNull(BrowserSafeKey.fromWire(value.string("key"))))
    }

    private fun fixture(): JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/browser-mirror.json")
            ?: error("Missing browser mirror fixture")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
    }

    private fun json(raw: String) = RemoteJson.parseToJsonElement(raw).jsonObject
    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content
    private fun JsonObject.number(name: String) = getValue(name).jsonPrimitive.content.toDouble()
    private fun message(cases: List<kotlinx.serialization.json.JsonElement>, id: String): String =
        cases.first { it.jsonObject.getValue("id").jsonPrimitive.content == id }
            .jsonObject.getValue("message").toString()

    private fun normalizeNumbers(element: JsonElement): JsonElement = when (element) {
        is JsonObject -> JsonObject(element.mapValues { (_, v) -> normalizeNumbers(v) })
        is kotlinx.serialization.json.JsonArray ->
            kotlinx.serialization.json.JsonArray(element.map { normalizeNumbers(it) })
        is kotlinx.serialization.json.JsonPrimitive -> {
            val content = element.content
            if (content != "true" && content != "false" && content != "null" &&
                content.toDoubleOrNull() != null
            ) {
                kotlinx.serialization.json.JsonPrimitive(content.toDouble())
            } else {
                element
            }
        }
    }
}
