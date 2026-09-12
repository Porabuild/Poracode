package com.poracode.app.model

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

sealed interface PatchValue<out T> {
    data object Unchanged : PatchValue<Nothing>
    data object Clear : PatchValue<Nothing>
    data class Set<T>(val value: T) : PatchValue<T>
}

@Serializable
data class GitHubAccountRef(
    val host: String,
    val login: String,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface CloneRepoSource

@Serializable
@SerialName("url")
data class CloneUrlSource(val url: String) : CloneRepoSource {
    override fun toString(): String = "CloneUrlSource(url=<redacted>)"
}

@Serializable
@SerialName("github")
data class CloneGitHubSource(
    val nameWithOwner: String,
    val account: GitHubAccountRef,
) : CloneRepoSource

@Serializable(with = ProjectPatchSerializer::class)
data class ProjectPatch(
    val name: PatchValue<String> = PatchValue.Unchanged,
    val scripts: PatchValue<ProjectScripts> = PatchValue.Unchanged,
    val searchSettings: PatchValue<ProjectSearchSettings> = PatchValue.Unchanged,
    val worktreeLocation: PatchValue<ProjectWorktreeLocation> = PatchValue.Unchanged,
    val mcpServers: PatchValue<List<McpServer>> = PatchValue.Unchanged,
    val disabled: PatchValue<Boolean> = PatchValue.Unchanged,
) {
    init {
        require(name !is PatchValue.Clear) { "name cannot be cleared" }
        require(disabled !is PatchValue.Clear) { "disabled cannot be cleared" }
    }
}

object ProjectPatchSerializer : KSerializer<ProjectPatch> {
    override val descriptor = buildClassSerialDescriptor("ProjectPatch")

    override fun deserialize(decoder: Decoder): ProjectPatch {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("ProjectPatch is JSON-only")
        val value = jsonDecoder.decodeJsonElement().jsonObject
        return ProjectPatch(
            name = value.patch("name", jsonDecoder, String.serializer(), allowClear = false),
            scripts = value.patch("scripts", jsonDecoder, ProjectScripts.serializer()),
            searchSettings = value.patch(
                "searchSettings",
                jsonDecoder,
                ProjectSearchSettings.serializer(),
            ),
            worktreeLocation = value.patch(
                "worktreeLocation",
                jsonDecoder,
                ProjectWorktreeLocation.serializer(),
            ),
            mcpServers = value.patch(
                "mcpServers",
                jsonDecoder,
                ListSerializer(McpServer.serializer()),
            ),
            disabled = value.patch("disabled", jsonDecoder, Boolean.serializer(), allowClear = false),
        )
    }

    override fun serialize(encoder: Encoder, value: ProjectPatch) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("ProjectPatch is JSON-only")
        jsonEncoder.encodeJsonElement(buildJsonObject {
            putPatch("name", value.name, jsonEncoder, String.serializer())
            putPatch("scripts", value.scripts, jsonEncoder, ProjectScripts.serializer())
            putPatch(
                "searchSettings",
                value.searchSettings,
                jsonEncoder,
                ProjectSearchSettings.serializer(),
            )
            putPatch(
                "worktreeLocation",
                value.worktreeLocation,
                jsonEncoder,
                ProjectWorktreeLocation.serializer(),
            )
            putPatch(
                "mcpServers",
                value.mcpServers,
                jsonEncoder,
                ListSerializer(McpServer.serializer()),
            )
            putPatch("disabled", value.disabled, jsonEncoder, Boolean.serializer())
        })
    }
}

private fun <T> JsonObject.patch(
    key: String,
    decoder: JsonDecoder,
    strategy: DeserializationStrategy<T>,
    allowClear: Boolean = true,
): PatchValue<T> {
    if (!containsKey(key)) return PatchValue.Unchanged
    val element = getValue(key)
    if (element is JsonNull) {
        if (!allowClear) throw SerializationException("$key cannot be null")
        return PatchValue.Clear
    }
    return PatchValue.Set(decoder.json.decodeFromJsonElement(strategy, element))
}

private fun <T> kotlinx.serialization.json.JsonObjectBuilder.putPatch(
    key: String,
    patch: PatchValue<T>,
    encoder: JsonEncoder,
    strategy: SerializationStrategy<T>,
) {
    when (patch) {
        PatchValue.Unchanged -> Unit
        PatchValue.Clear -> put(key, JsonNull)
        is PatchValue.Set -> put(key, encoder.json.encodeToJsonElement(strategy, patch.value))
    }
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface ProjectCommand

@Serializable
@SerialName("add-existing")
data class AddExistingProject(
    val path: String,
    val name: String? = null,
) : ProjectCommand

@Serializable
@SerialName("create")
data class CreateProject(
    val parentPath: String,
    val name: String,
) : ProjectCommand

@Serializable
@SerialName("clone")
data class CloneProject(
    val parentPath: String,
    val name: String,
    val source: CloneRepoSource,
) : ProjectCommand

@Serializable
@SerialName("update")
data class UpdateProject(
    val projectId: String,
    val patch: ProjectPatch,
) : ProjectCommand

@Serializable
@SerialName("relocate")
data class RelocateProject(
    val projectId: String,
    val path: String,
) : ProjectCommand

@Serializable
@SerialName("remove")
data class RemoveProject(val projectId: String) : ProjectCommand

@Serializable
data class ProjectCommandResult(
    val projects: List<RemoteProject>,
    val project: RemoteProject? = null,
)
