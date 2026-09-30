package com.poracode.app.protocol.browsermirror

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.browsermirror.BrowserCommand
import com.poracode.app.model.browsermirror.BrowserFrameMetadata
import com.poracode.app.model.browsermirror.BrowserFramePolicy
import com.poracode.app.model.browsermirror.BrowserInput
import com.poracode.app.model.browsermirror.BrowserMirrorAvailability
import com.poracode.app.model.browsermirror.BrowserMirrorStatus
import com.poracode.app.model.browsermirror.BrowserServerMessage
import com.poracode.app.model.browsermirror.BrowserState
import com.poracode.app.model.browsermirror.BrowserTab
import com.poracode.app.model.browsermirror.BrowserTabPosition
import com.poracode.app.protocol.GeneratedRemoteV3Contract
import com.poracode.remote.v3.generated.RemoteContractMetadata
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EBrowserU2DCommandU2ERequest
import com.poracode.remote.v3.generated.routeU2EBrowserU2DCommandU2EResponse
import com.poracode.remote.v3.generated.routeU2EBrowserU2DStateU2EResponse
import com.poracode.remote.v3.generated.websocketU2EClientU2EBrowserU2DInput
import com.poracode.remote.v3.generated.websocketU2EClientU2EBrowserU2DUnwatch
import com.poracode.remote.v3.generated.websocketU2EClientU2EBrowserU2DWatch
import com.poracode.remote.v3.generated.websocketU2EServerU2EBrowserU2DFrame
import com.poracode.remote.v3.generated.websocketU2EServerU2EBrowserU2DMirrorU2DStatus
import com.poracode.remote.v3.generated.websocketU2EServerU2EBrowserU2DState
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class BrowserMirrorRoute(
    val method: String,
    val path: String,
    val requiredScope: String,
)

/** The only browser-mirror file allowed to know generated symbol names. */
object GeneratedBrowserMirrorContract {
    private const val STATE_ROUTE_ID = "browser-state"
    private const val COMMAND_ROUTE_ID = "browser-command"
    private val routes = RemoteContractMetadata.routes.associateBy { it.id }

    init {
        GeneratedRemoteV3Contract.verifyRuntimeCompatibility()
        check(route(STATE_ROUTE_ID) == BrowserMirrorRoute("GET", "/api/browser/state", "session:read"))
        check(route(COMMAND_ROUTE_ID) == BrowserMirrorRoute("POST", "/api/browser/command", "session:operate"))
    }

    fun stateRoute(): BrowserMirrorRoute = route(STATE_ROUTE_ID)

    fun commandRoute(): BrowserMirrorRoute = route(COMMAND_ROUTE_ID)

    fun commandRequest(command: BrowserCommand): String = canonical(
        RemoteRootCodecs.routeU2EBrowserU2DCommandU2ERequest,
        command.toJson().toString(),
    )

    fun stateResponse(raw: String): BrowserState = stateFromEnvelope(
        canonicalObject(RemoteRootCodecs.routeU2EBrowserU2DStateU2EResponse, raw),
    )

    fun commandResponse(raw: String): BrowserState = stateFromEnvelope(
        canonicalObject(RemoteRootCodecs.routeU2EBrowserU2DCommandU2EResponse, raw),
    )

    fun watchMessage(): String = canonical(
        RemoteRootCodecs.websocketU2EClientU2EBrowserU2DWatch,
        """{"type":"browser-watch"}""",
    )

    fun unwatchMessage(): String = canonical(
        RemoteRootCodecs.websocketU2EClientU2EBrowserU2DUnwatch,
        """{"type":"browser-unwatch"}""",
    )

    fun inputMessage(input: BrowserInput): String = canonical(
        RemoteRootCodecs.websocketU2EClientU2EBrowserU2DInput,
        buildJsonObject {
            put("type", "browser-input")
            put("input", input.toJson())
        }.toString(),
    )

    fun serverMessage(raw: String): BrowserServerMessage {
        if (raw.length > BrowserFramePolicy.MAX_MESSAGE_UTF16_UNITS) throw invalid("websocket")
        val root = parseObject(raw)
        return when (root.string("type")) {
            "browser-state" -> {
                val value = canonicalObject(
                    RemoteRootCodecs.websocketU2EServerU2EBrowserU2DState,
                    raw,
                )
                BrowserServerMessage.State(stateFromObject(value.objectValue("state")))
            }
            "browser-frame" -> decodeFrame(
                canonicalObject(RemoteRootCodecs.websocketU2EServerU2EBrowserU2DFrame, raw),
            )
            "browser-mirror-status" -> decodeStatus(
                canonicalObject(
                    RemoteRootCodecs.websocketU2EServerU2EBrowserU2DMirrorU2DStatus,
                    raw,
                ),
            )
            else -> throw invalid("websocket.variant")
        }
    }

    private fun decodeFrame(value: JsonObject): BrowserServerMessage.Frame {
        val metadata = value.objectValue("metadata")
        val frame = BrowserFramePolicy.decodeJpeg(
            tabId = value.stringValue("tabId"),
            base64 = value.stringValue("data"),
            metadata = BrowserFrameMetadata(
                deviceWidth = metadata.doubleValue("deviceWidth"),
                deviceHeight = metadata.doubleValue("deviceHeight"),
                pageScaleFactor = metadata.doubleValue("pageScaleFactor"),
                offsetTop = metadata.doubleValue("offsetTop"),
                scrollOffsetX = metadata.doubleValue("scrollOffsetX"),
                scrollOffsetY = metadata.doubleValue("scrollOffsetY"),
            ),
        ) ?: throw invalid("websocket.browser-frame.jpeg")
        return BrowserServerMessage.Frame(frame)
    }

    private fun decodeStatus(value: JsonObject): BrowserServerMessage.Status {
        val status = value.objectValue("status")
        val availability = when (status.stringValue("status")) {
            "starting" -> BrowserMirrorAvailability.Starting
            "active" -> BrowserMirrorAvailability.Active
            "unavailable" -> BrowserMirrorAvailability.Unavailable
            else -> throw invalid("websocket.browser-status.value")
        }
        return BrowserServerMessage.Status(
            BrowserMirrorStatus(availability, status.string("tabId")),
        )
    }

    private fun stateFromEnvelope(value: JsonObject): BrowserState =
        stateFromObject(value.objectValue("state"))

    private fun stateFromObject(value: JsonObject): BrowserState {
        val tabs = value.getValue("tabs").jsonArray.map { element ->
            val tab = element.jsonObject
            BrowserTab(
                tabId = tab.stringValue("tabId"),
                url = tab.stringValue("url"),
                title = tab.stringValue("title"),
                faviconUrl = tab.string("faviconUrl"),
                loading = tab.getValue("loading").jsonPrimitive.content.toBooleanStrict(),
                canGoBack = tab.getValue("canGoBack").jsonPrimitive.content.toBooleanStrict(),
                canGoForward = tab.getValue("canGoForward").jsonPrimitive.content.toBooleanStrict(),
            )
        }
        val active = value.string("activeTabId")
        if (active != null && tabs.none { it.tabId == active }) {
            throw invalid("browser-state.active-tab")
        }
        return BrowserState(tabs, active)
    }

    private fun BrowserCommand.toJson(): JsonObject = buildJsonObject {
        when (this@toJson) {
            is BrowserCommand.CreateTab -> {
                put("kind", "create-tab")
                url?.let { put("url", it) }
            }
            is BrowserCommand.CloseTab -> {
                put("kind", "close-tab")
                put("tabId", tabId)
            }
            is BrowserCommand.ActivateTab -> {
                put("kind", "activate-tab")
                put("tabId", tabId)
            }
            is BrowserCommand.MoveTab -> {
                put("kind", "move-tab")
                put("tabId", tabId)
                put("targetTabId", targetTabId)
                put("position", if (position == BrowserTabPosition.Before) "before" else "after")
            }
            is BrowserCommand.Navigate -> {
                put("kind", "navigate")
                put("tabId", tabId)
                put("url", url)
            }
            is BrowserCommand.Back -> tabCommand("back", tabId)
            is BrowserCommand.Forward -> tabCommand("forward", tabId)
            is BrowserCommand.Reload -> tabCommand("reload", tabId)
        }
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.tabCommand(kind: String, tabId: String) {
        put("kind", kind)
        put("tabId", tabId)
    }

    private fun BrowserInput.toJson(): JsonObject = buildJsonObject {
        when (this@toJson) {
            is BrowserInput.Tap -> {
                put("kind", "tap")
                put("x", x)
                put("y", y)
            }
            is BrowserInput.Scroll -> {
                put("kind", "scroll")
                put("x", x)
                put("y", y)
                put("deltaX", deltaX)
                put("deltaY", deltaY)
            }
            is BrowserInput.InsertText -> {
                put("kind", "insert-text")
                put("text", text)
            }
            is BrowserInput.Key -> {
                put("kind", "key")
                put("key", key.wireValue)
            }
        }
    }

    private fun route(id: String): BrowserMirrorRoute {
        val generated = checkNotNull(routes[id])
        check(generated.auth == "bearer" && generated.status == 200 && generated.scopes.size == 1)
        return BrowserMirrorRoute(generated.method, generated.path, generated.scopes.single())
    }

    private fun canonicalObject(codec: RemoteRootCodec<*>, raw: String): JsonObject =
        parseObject(canonical(codec, raw))

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun parseObject(raw: String): JsonObject = try {
        Json.parseToJsonElement(raw).jsonObject
    } catch (_: Exception) {
        throw invalid("json")
    }

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.stringValue(name: String): String = string(name)
        ?: throw invalid("field.$name")

    private fun JsonObject.doubleValue(name: String): Double = try {
        getValue(name).jsonPrimitive.double
    } catch (_: Exception) {
        throw invalid("field.$name")
    }

    private fun JsonObject.objectValue(name: String): JsonObject = try {
        getValue(name).jsonObject
    } catch (_: Exception) {
        throw invalid("field.$name")
    }

    private fun invalid(boundary: String) = RemoteClientException.invalidResponse(
        "Remote browser mirror contract validation failed at $boundary.",
    )
}
