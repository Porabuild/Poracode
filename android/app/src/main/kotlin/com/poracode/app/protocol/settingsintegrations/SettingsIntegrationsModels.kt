package com.poracode.app.protocol.settingsintegrations

import com.poracode.app.model.ProjectLocation
import java.net.URI

enum class SkillScope(val wireValue: String) { Global("global"), Project("project") }

enum class SkillAvailability(val wireValue: String) { Shared("shared"), Poracode("poracode") }

enum class SkillImportMode(val wireValue: String) { Copy("copy"), Link("link") }

enum class SkillMarketplace(val wireValue: String) {
    SkillsSh("skills-sh"),
    SkillsDirectory("skills-directory"),
}

enum class MarketplaceSort(val wireValue: String) { Rank("rank"), Stars("stars"), Recent("recent"), Votes("votes") }

data class SkillOwner(
    val projectId: String?,
    val projectLocation: ProjectLocation?,
    val projectGeneration: Long,
) {
    init {
        require((projectId == null) == (projectLocation == null))
        require(projectGeneration >= 0)
    }

    val isGlobal: Boolean get() = projectLocation == null

    companion object {
        val Global = SkillOwner(null, null, 0)
    }
}

data class SkillScanRequest(
    val owner: SkillOwner,
    val agentKind: String? = null,
    val presentationMode: String = "gui",
)

data class SkillEntry(
    val id: String,
    val name: String,
    val description: String,
    val absolutePath: String,
    val enabled: Boolean,
    val mutable: Boolean,
    val linked: Boolean,
    val valid: Boolean,
    val scope: SkillScope,
    val origin: String,
    val providerLabel: String,
    val sourcePath: String?,
    val invalidReason: String?,
    val importState: String?,
)

data class SkillIssue(val providerId: String, val path: String, val message: String)

data class SkillScanResult(
    val skills: List<SkillEntry>,
    val effectiveSkillIds: Set<String>,
    val invocation: String?,
    val issues: List<SkillIssue>,
    val canLinkToGlobal: Boolean,
)

data class MarketplaceRequest(
    val marketplace: SkillMarketplace,
    val query: String? = null,
    val sort: MarketplaceSort = MarketplaceSort.Rank,
)

data class MarketplaceSkill(
    val id: String,
    val skillId: String,
    val name: String,
    val description: String?,
    val marketplace: SkillMarketplace,
    val source: String,
    val rank: Long,
    val stars: Long?,
    val votes: Long?,
    val installs: Long?,
    val official: Boolean,
    val securityGrade: String?,
)

data class MarketplaceResult(
    val marketplace: SkillMarketplace,
    val skills: List<MarketplaceSkill>,
    val total: Long,
)

data class SkillImportItem(
    val sourcePath: String,
    val mode: SkillImportMode,
    val destinationScope: SkillScope,
    val destinationOwner: SkillOwner,
    val sourceOwner: SkillOwner = SkillOwner.Global,
    val availability: SkillAvailability? = null,
    val replace: Boolean = false,
) {
    init {
        require(sourcePath.isNotBlank())
        require(destinationScope != SkillScope.Project || !destinationOwner.isGlobal)
    }
}

data class MarketplaceInstallRequest(
    val owner: SkillOwner,
    val marketplace: SkillMarketplace,
    val marketplaceSkillId: String,
    val destinationScope: SkillScope,
    val availability: SkillAvailability? = null,
    val replace: Boolean = false,
)

enum class McpDiscoveryScope { User, WslUser, Workspace }

data class McpDiscoveryRequest(
    val scope: McpDiscoveryScope,
    val owner: SkillOwner = SkillOwner.Global,
    val wslDistro: String? = null,
) {
    init {
        require(scope != McpDiscoveryScope.Workspace || !owner.isGlobal)
        require(scope != McpDiscoveryScope.WslUser || !wslDistro.isNullOrBlank())
    }
}

/** Secret-bearing values deliberately redact their string representation. */
class SecretValues private constructor(private val values: Map<String, String>) {
    fun visit(block: (String, String) -> Unit) = values.forEach(block)
    val isEmpty: Boolean get() = values.isEmpty()
    override fun toString(): String = "SecretValues([redacted], size=${values.size})"
    override fun equals(other: Any?): Boolean = other is SecretValues && values == other.values
    override fun hashCode(): Int = values.hashCode()

    companion object {
        val Empty = SecretValues(emptyMap())
        fun of(values: Map<String, String>) = SecretValues(values.toMap())
    }
}

sealed interface McpTransport {
    val safeLabel: String

    class Stdio(
        val command: String,
        val args: List<String> = emptyList(),
        val cwd: String? = null,
        val environment: SecretValues = SecretValues.Empty,
    ) : McpTransport {
        override val safeLabel: String get() = command.substringAfterLast('/').substringAfterLast('\\')
        override fun toString(): String = "Stdio(command=$safeLabel, args=${args.size}, environment=[redacted])"
    }

    class Http(
        val url: String,
        val headers: SecretValues = SecretValues.Empty,
        val sse: Boolean = false,
    ) : McpTransport {
        override val safeLabel: String
            get() = runCatching {
                val parsed = URI(url)
                val host = parsed.host?.take(100) ?: return@runCatching "HTTP"
                val scheme = parsed.scheme?.lowercase()?.take(12) ?: "https"
                "$scheme://$host"
            }.getOrDefault("HTTP")
        override fun toString(): String = "Http(url=$safeLabel, headers=[redacted], sse=$sse)"
    }
}

data class McpServer(
    val id: String,
    val name: String,
    val description: String = "",
    val enabled: Boolean = true,
    val timeoutMs: Long = 30_000,
    val disabledTools: List<String> = emptyList(),
    val transport: McpTransport,
) {
    override fun toString(): String =
        "McpServer(id=$id, name=$name, enabled=$enabled, transport=$transport)"
}

data class ExternalMcpServer(
    val server: McpServer,
    val unsupportedReason: String?,
)

data class ExternalMcpGroup(
    val providerId: String,
    val providerLabel: String,
    val sourcePath: String,
    val servers: List<ExternalMcpServer>,
)

data class McpProbeResult(
    val status: String,
    val latencyMs: Long,
    val runtime: String,
    val projectScoped: Boolean,
    val toolCount: Int,
    val tools: List<String>,
    val errorCode: String?,
    val authScheme: String?,
)

data class McpOauthStatus(val authenticatedUrls: Set<String>) {
    override fun toString(): String = "McpOauthStatus(authenticatedUrls=[redacted], count=${authenticatedUrls.size})"
}

sealed interface McpOauthResult {
    data object Authorized : McpOauthResult
    class Redirect(val flowId: String, val authorizationUrl: String) : McpOauthResult {
        override fun toString(): String = "Redirect(flowId=[redacted], authorizationUrl=[redacted])"
    }
    data object Error : McpOauthResult
}
