package com.poracode.app.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class ProjectTodo(
    val id: String,
    val text: String,
    val done: Boolean,
    val createdAt: String,
)

@Serializable
data class ProjectNotes(
    val projectId: String,
    val doc: JsonElement? = null,
    /** Wire order is presentation order and must be retained. */
    val todos: List<ProjectTodo>,
    val updatedAt: String,
    val revision: String? = null,
)

@Serializable
data class ProjectNotesReadResult(
    val notes: ProjectNotes?,
    val guardedWrites: Int? = null,
)

@Serializable(with = ProjectNotesWriteBodySerializer::class)
data class ProjectNotesWriteBody(
    val doc: JsonElement?,
    /** The path owns project identity; this body intentionally has no projectId. */
    val todos: List<ProjectTodo>,
    val updatedAt: String,
    val guarded: Boolean = false,
    val baseRevision: String? = null,
)

@Serializable
data class ProjectNotesSaveResult(val status: String, val notes: ProjectNotes?)

@Serializable
data class ProjectNotesWriteResponse(val result: ProjectNotesSaveResult? = null)

object ProjectNotesWriteBodySerializer : KSerializer<ProjectNotesWriteBody> {
    override val descriptor = buildClassSerialDescriptor("ProjectNotesWriteBody")

    override fun deserialize(decoder: Decoder): ProjectNotesWriteBody {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("ProjectNotesWriteBody is JSON-only")
        val value = jsonDecoder.decodeJsonElement().jsonObject
        val guarded = "replacement" in value
        val content = if (guarded) value.getValue("replacement").jsonObject else value
        if ("doc" !in content) throw SerializationException("doc is required")
        return ProjectNotesWriteBody(
            doc = content.getValue("doc").takeUnless { it is JsonNull },
            todos = jsonDecoder.json.decodeFromJsonElement(
                ListSerializer(ProjectTodo.serializer()),
                content.getValue("todos"),
            ),
            updatedAt = if (guarded) "" else value.getValue("updatedAt").jsonPrimitive.content,
            guarded = guarded,
            baseRevision = value["baseRevision"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
        )
    }

    override fun serialize(encoder: Encoder, value: ProjectNotesWriteBody) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("ProjectNotesWriteBody is JSON-only")
        val content = buildJsonObject {
            put("doc", value.doc ?: JsonNull)
            put(
                "todos",
                jsonEncoder.json.encodeToJsonElement(
                    ListSerializer(ProjectTodo.serializer()),
                    value.todos,
                ),
            )
            if (!value.guarded) put("updatedAt", jsonEncoder.json.encodeToJsonElement(String.serializer(), value.updatedAt))
        }
        jsonEncoder.encodeJsonElement(if (value.guarded) buildJsonObject {
            put("replacement", content)
            put("baseRevision", value.baseRevision?.let { jsonEncoder.json.encodeToJsonElement(String.serializer(), it) } ?: JsonNull)
        } else content)
    }
}
