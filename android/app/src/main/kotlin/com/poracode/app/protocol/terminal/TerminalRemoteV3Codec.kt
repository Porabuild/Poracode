package com.poracode.app.protocol.terminal

import com.poracode.app.chat.TerminalCursorFrameDecoder
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.terminal.TerminalDimensions
import com.poracode.app.model.terminal.TerminalProcessState
import com.poracode.app.model.terminal.TerminalServerFrame
import com.poracode.app.model.terminal.TerminalWatchError
import com.poracode.app.model.terminal.TerminalWatchErrorCode
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.routeU2EEnvironmentU2EResponse
import com.poracode.remote.v3.generated.websocketU2EClientU2ETerminalU2DUnwatch
import com.poracode.remote.v3.generated.websocketU2EClientU2ETerminalU2DWatch
import com.poracode.remote.v3.generated.websocketU2EServerU2EReady
import com.poracode.remote.v3.generated.websocketU2EServerU2ETerminalU2DOutput
import com.poracode.remote.v3.generated.websocketU2EServerU2ETerminalU2DWatchU2DResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** Canonical terminal-only facade over the committed remote-v3 generated roots. */
object TerminalRemoteV3Codec {
    const val CURSOR_SYNC_VERSION = 1
    const val MAX_SERVER_FRAME_UTF16_UNITS = 512_000

    fun encodeWatch(terminalId: String, watchId: String): String = canonical(
        RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatch,
        buildJsonObject {
            put("type", "terminal-watch")
            put("id", terminalId)
            put(
                "cursorSync",
                buildJsonObject {
                    put("version", CURSOR_SYNC_VERSION)
                    put("watchId", watchId)
                },
            )
        },
    )

    fun encodeUnwatch(terminalId: String): String = canonical(
        RemoteRootCodecs.websocketU2EClientU2ETerminalU2DUnwatch,
        buildJsonObject {
            put("type", "terminal-unwatch")
            put("id", terminalId)
        },
    )

    fun isReadyFrame(raw: String): Boolean {
        if (raw.length > MAX_SERVER_FRAME_UTF16_UNITS) return false
        val value = runCatching { parse(raw) }.getOrNull() as? JsonObject ?: return false
        if (value.string("type") != "ready") return false
        return runCatching { canonical(RemoteRootCodecs.websocketU2EServerU2EReady, value) }
            .isSuccess
    }

    fun decodeServerFrame(raw: String): TerminalServerFrame? {
        if (raw.length > MAX_SERVER_FRAME_UTF16_UNITS) throw invalid("oversized frame")
        val source = parse(raw) as? JsonObject ?: throw invalid("terminal frame")
        val codec = when (source.string("type")) {
            "terminal-output" -> RemoteRootCodecs.websocketU2EServerU2ETerminalU2DOutput
            "terminal-watch-result" ->
                RemoteRootCodecs.websocketU2EServerU2ETerminalU2DWatchU2DResult
            else -> return null
        }
        val canonical = parse(canonical(codec, source))
        TerminalCursorFrameDecoder.decode(canonical)?.let { frame ->
            val result = (canonical as? JsonObject)
                ?.get("cursorSync")?.objectOrNull()
                ?.get("result")?.objectOrNull()
            return TerminalServerFrame.Cursor(
                frame = frame,
                processState = when (result?.string("processState")) {
                    "running" -> TerminalProcessState.Running
                    "exited" -> TerminalProcessState.Exited
                    else -> null
                },
                dimensions = result?.get("terminalSize")?.objectOrNull()?.let { size ->
                    val columns = size.positiveInt("cols") ?: throw invalid("terminal columns")
                    val rows = size.positiveInt("rows") ?: throw invalid("terminal rows")
                    TerminalDimensions(columns, rows)
                },
            )
        }
        return decodeWatchError(canonical)
            ?: throw invalid("terminal cursor frame")
    }

    fun supportsCursorV1(rawEnvironment: String): Boolean {
        val canonical = parse(
            canonical(RemoteRootCodecs.routeU2EEnvironmentU2EResponse, parse(rawEnvironment)),
        ) as? JsonObject ?: return false
        val versions = canonical["capabilities"]?.objectOrNull()
            ?.get("terminalCursorSync")?.objectOrNull()
            ?.get("versions") as? JsonArray ?: return false
        return versions.any { (it as? JsonPrimitive)?.intOrNull == CURSOR_SYNC_VERSION }
    }

    private fun decodeWatchError(value: JsonElement): TerminalServerFrame.WatchError? {
        val root = value as? JsonObject ?: return null
        val terminalId = root.string("id") ?: return null
        val sync = root["cursorSync"]?.objectOrNull() ?: return null
        val watchId = sync.string("watchId") ?: return null
        val result = sync["result"]?.objectOrNull() ?: return null
        if (result.string("status") != "error") return null
        val code = when (result.string("code")) {
            "forbidden" -> TerminalWatchErrorCode.Forbidden
            "not-found" -> TerminalWatchErrorCode.NotFound
            "unavailable" -> TerminalWatchErrorCode.Unavailable
            else -> return null
        }
        val retryable = (result["retryable"] as? JsonPrimitive)
            ?.takeUnless(JsonPrimitive::isString)?.content?.toBooleanStrictOrNull() ?: return null
        return TerminalServerFrame.WatchError(
            TerminalWatchError(terminalId, watchId, code, retryable),
        )
    }

    private fun canonical(codec: RemoteRootCodec<*>, value: JsonElement): String = try {
        codec.decode(value.toString()).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun parse(raw: String): JsonElement = try {
        Json.parseToJsonElement(raw)
    } catch (_: Exception) {
        throw invalid("JSON")
    }

    private fun JsonElement.objectOrNull(): JsonObject? = when (this) {
        is JsonObject -> this
        JsonNull -> null
        else -> null
    }

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

    private fun JsonObject.nonnegativeInt(name: String): Int? =
        (get(name) as? JsonPrimitive)?.takeUnless(JsonPrimitive::isString)?.intOrNull
            ?.takeIf { it >= 0 }

    private fun JsonObject.positiveInt(name: String): Int? =
        nonnegativeInt(name)?.takeIf { it > 0 }

    private fun invalid(boundary: String) = RemoteClientException.invalidResponse(
        "Remote terminal contract validation failed at $boundary.",
    )
}
