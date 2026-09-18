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
)

@Serializable
data class ProjectNotesReadResult(
    val notes: ProjectNotes?,
)

@Serializable(with = ProjectNotesWriteBodySerializer::class)
data class ProjectNotesWriteBody(
    val doc: JsonElement?,
    /** The path owns project identity; this body intentionally has no projectId. */
    val todos: List<ProjectTodo>,
    val updatedAt: String,
)

object ProjectNotesWriteBodySerializer : KSerializer<ProjectNotesWriteBody> {
    override val descriptor = buildClassSerialDescriptor("ProjectNotesWriteBody")

    override fun deserialize(decoder: Decoder): ProjectNotesWriteBody {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("ProjectNotesWriteBody is JSON-only")
        val value = jsonDecoder.decodeJsonElement().jsonObject
        if ("doc" !in value) throw SerializationException("doc is required")
        return ProjectNotesWriteBody(
            doc = value.getValue("doc").takeUnless { it is JsonNull },
            todos = jsonDecoder.json.decodeFromJsonElement(
                ListSerializer(ProjectTodo.serializer()),
                value.getValue("todos"),
            ),
            updatedAt = value.getValue("updatedAt").jsonPrimitive.content,
        )
    }

    override fun serialize(encoder: Encoder, value: ProjectNotesWriteBody) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("ProjectNotesWriteBody is JSON-only")
        jsonEncoder.encodeJsonElement(buildJsonObject {
            put("doc", value.doc ?: JsonNull)
            put(
                "todos",
                jsonEncoder.json.encodeToJsonElement(
                    ListSerializer(ProjectTodo.serializer()),
                    value.todos,
                ),
            )
            put("updatedAt", jsonEncoder.json.encodeToJsonElement(String.serializer(), value.updatedAt))
        })
    }
}
