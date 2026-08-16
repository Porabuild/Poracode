package com.poracode.app.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonClassDiscriminator

@Serializable
data class ProjectDraftConfig(
    val agentKind: String,
    val model: String = "",
    val effort: String? = null,
    val contextSize: String? = null,
    val fast: Boolean? = null,
    val thinking: Boolean? = null,
    val mode: String? = null,
    val approvalPolicy: String? = null,
    val approvalsReviewer: String? = null,
    val sandboxMode: String? = null,
    val browserMcp: Boolean? = null,
    val crossagentMcp: Boolean? = null,
    val computerUse: Boolean? = null,
    val chromeMcp: Boolean? = null,
    val worktreeMode: Boolean? = null,
)

@Serializable
data class ProjectAction(
    val id: String,
    val name: String,
    val command: String,
    val icon: String? = null,
) {
    override fun toString(): String =
        "ProjectAction(id=$id, name=$name, command=<redacted>, icon=$icon)"
}

@Serializable
data class ProjectScripts(
    val setupScript: String? = null,
    val cleanupScript: String? = null,
    val worktreeCopyPatterns: List<String>? = null,
    val actions: List<ProjectAction> = emptyList(),
) {
    override fun toString(): String =
        "ProjectScripts(setup=${setupScript != null}, cleanup=${cleanupScript != null}, " +
            "copyPatterns=${worktreeCopyPatterns?.size ?: 0}, actions=${actions.size})"
}

@Serializable
data class ProjectSearchSettings(
    val useIgnoreFiles: Boolean? = null,
    val exclude: Map<String, Boolean>? = null,
)

@Serializable
enum class WorktreeStorageMode {
    @SerialName("global")
    GLOBAL,

    @SerialName("project-relative")
    PROJECT_RELATIVE,
}

@Serializable
data class ProjectWorktreeLocation(
    val mode: WorktreeStorageMode? = null,
    val basePath: String? = null,
)

/** Map values that must never appear in generated log/toString output. */
@Serializable(with = SensitiveStringMapSerializer::class)
class SensitiveStringMap internal constructor(
    internal val wireValues: Map<String, String>,
) {
    val size: Int get() = wireValues.size
    val keys: Set<String> get() = wireValues.keys

    fun valueFor(key: String): String? = wireValues[key]

    override fun equals(other: Any?): Boolean =
        other is SensitiveStringMap && wireValues == other.wireValues

    override fun hashCode(): Int = wireValues.hashCode()

    override fun toString(): String = "<redacted:${wireValues.size}>"

    companion object {
        fun empty(): SensitiveStringMap = SensitiveStringMap(emptyMap())
        fun of(values: Map<String, String>): SensitiveStringMap = SensitiveStringMap(values.toMap())
    }
}

object SensitiveStringMapSerializer : KSerializer<SensitiveStringMap> {
    private val delegate = MapSerializer(String.serializer(), String.serializer())
    override val descriptor = delegate.descriptor

    override fun deserialize(decoder: Decoder): SensitiveStringMap =
        SensitiveStringMap(delegate.deserialize(decoder))

    override fun serialize(encoder: Encoder, value: SensitiveStringMap) {
        delegate.serialize(encoder, value.wireValues)
    }
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface McpTransport

@Serializable
@SerialName("stdio")
data class McpStdioTransport(
    val command: String,
    val args: List<String> = emptyList(),
    val env: SensitiveStringMap = SensitiveStringMap.empty(),
    val cwd: String? = null,
) : McpTransport {
    override fun toString(): String = "McpStdioTransport(<redacted>)"
}

@Serializable
@SerialName("http")
data class McpHttpTransport(
    val url: String,
    val headers: SensitiveStringMap = SensitiveStringMap.empty(),
) : McpTransport {
    override fun toString(): String = "McpHttpTransport(<redacted>)"
}

@Serializable
@SerialName("sse")
data class McpSseTransport(
    val url: String,
    val headers: SensitiveStringMap = SensitiveStringMap.empty(),
) : McpTransport {
    override fun toString(): String = "McpSseTransport(<redacted>)"
}

@Serializable
data class McpServer(
    val id: String,
    val name: String,
    val description: String = "",
    val enabled: Boolean = true,
    val timeoutMs: Int = DEFAULT_TIMEOUT_MS,
    val disabledTools: List<String>? = null,
    val transport: McpTransport,
) {
    override fun toString(): String =
        "McpServer(id=$id, name=$name, enabled=$enabled, transport=${transport::class.simpleName}, " +
            "sensitiveConfig=<redacted>)"

    companion object {
        const val DEFAULT_TIMEOUT_MS = 30_000
    }
}

/** Kept separate from RemoteProject because MCP configuration may contain secrets. */
@Serializable
data class ProjectSettings(
    val mcpServers: List<McpServer>? = null,
)
