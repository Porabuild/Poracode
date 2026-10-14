package com.poracode.app.transport

import com.poracode.app.model.BrowseHostDirectoryResult
import com.poracode.app.model.DetectSetupScriptResult
import com.poracode.app.model.ProjectCommandResult
import com.poracode.app.model.ProjectNotesReadResult
import com.poracode.app.model.ProjectSettings
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonPrimitive

/** Projects canonical generated snapshots into stable project-domain models. */
internal object ProjectRemoteV3Adapters {
    /**
     * Decodes the complete/bounded project-command response union explicitly.
     * The generated contract has already validated the envelope; this
     * projection must not guess at the shape: a `projects` member selects the
     * legacy complete result and an `ok: true` literal selects the bounded
     * acknowledgement (which is never an empty catalog). Anything else is an
     * invalid response.
     *
     * When the caller declared the bounded result mode and receives the
     * complete result instead, the host did not honor the declaration. The 200
     * proves the mutation already executed, so this surfaces as the same
     * [RemoteClientException.invalidResponse] every post-response schema
     * mismatch uses: 500 `invalid_response`, may-have-committed for mutations,
     * never a success and never a definite no-effect failure.
     */
    fun commandResult(raw: String, boundedDeclared: Boolean = false): ProjectCommandResult {
        val envelope = parseEnvelope(raw, "project command")
        return when {
            envelope.containsKey("projects") -> {
                if (boundedDeclared) {
                    throw RemoteClientException.invalidResponse(
                        "The host did not honor the bounded project-command result declaration.",
                    )
                }
                decode(envelope, ProjectCommandResult.Complete.serializer(), "project command")
            }
            envelope["ok"]?.jsonPrimitive?.booleanOrNull == true ->
                decode(envelope, ProjectCommandResult.Bounded.serializer(), "project command")
            else -> throw RemoteClientException.invalidResponse(
                "Remote project command result is neither a complete nor a bounded result.",
            )
        }
    }

    fun settings(raw: String): ProjectSettings = project(
        raw,
        ProjectSettings.serializer(),
        "project settings",
    )

    fun notes(raw: String): ProjectNotesReadResult = project(
        raw,
        ProjectNotesReadResult.serializer(),
        "project notes",
    )

    fun directory(raw: String): BrowseHostDirectoryResult = project(
        raw,
        BrowseHostDirectoryResult.serializer(),
        "host directory",
    )

    fun setupScript(raw: String): DetectSetupScriptResult = project(
        raw,
        DetectSetupScriptResult.serializer(),
        "setup detection",
    )

    private fun parseEnvelope(raw: String, boundary: String): JsonObject = try {
        Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("not an object")
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote project projection failed at $boundary.",
        )
    }

    private fun <T> decode(envelope: JsonObject, serializer: KSerializer<T>, boundary: String): T =
        try {
            RemoteJson.decodeFromJsonElement(serializer, envelope)
        } catch (_: Exception) {
            throw RemoteClientException.invalidResponse(
                "Remote project projection failed at $boundary.",
            )
        }

    private fun <T> project(raw: String, serializer: KSerializer<T>, boundary: String): T = try {
        RemoteJson.decodeFromString(serializer, raw)
    } catch (_: Exception) {
        throw RemoteClientException.invalidResponse(
            "Remote project projection failed at $boundary.",
        )
    }
}
