package com.poracode.app.protocol.settingsintegrations

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

object SettingsIntegrationsWire {
    fun scan(request: SkillScanRequest) = buildJsonObject {
        owner(request.owner)
        request.agentKind?.let { put("agentKind", it) }
        put("presentationMode", request.presentationMode)
        wslDistro(request.owner.projectLocation)
    }

    fun marketplace(request: MarketplaceRequest) = buildJsonObject {
        put("marketplace", request.marketplace.wireValue)
        request.query?.takeIf(String::isNotBlank)?.let { put("query", it.take(200)) }
        put("sort", request.sort.wireValue)
    }

    fun skillMutation(owner: SkillOwner, path: String, enabled: Boolean? = null) = buildJsonObject {
        put("absolutePath", path)
        enabled?.let { put("enabled", it) }
        owner(owner)
        wslDistro(owner.projectLocation)
    }

    fun importSkills(items: List<SkillImportItem>) = buildJsonObject {
        putJsonArray("skills") {
            items.forEach { item ->
                addJsonObject {
                    put("sourcePath", item.sourcePath)
                    put("mode", item.mode.wireValue)
                    put("destinationScope", item.destinationScope.wireValue)
                    item.availability?.let { put("availability", it.wireValue) }
                    if (item.replace) put("replace", true)
                    item.destinationOwner.projectLocation?.let { put("projectLocation", location(it)) }
                    item.sourceOwner.projectLocation?.let { put("sourceProjectLocation", location(it)) }
                    (item.destinationOwner.projectLocation as? WslProjectLocation)?.let {
                        put("wslDistro", it.distro)
                    }
                    (item.sourceOwner.projectLocation as? WslProjectLocation)?.let {
                        put("sourceWslDistro", it.distro)
                    }
                }
            }
        }
    }

    fun install(request: MarketplaceInstallRequest) = buildJsonObject {
        owner(request.owner)
        put("marketplace", request.marketplace.wireValue)
        put("marketplaceSkillId", request.marketplaceSkillId)
        put("destinationScope", request.destinationScope.wireValue)
        request.availability?.let { put("availability", it.wireValue) }
        if (request.replace) put("replace", true)
        wslDistro(request.owner.projectLocation)
    }

    fun discovery(request: McpDiscoveryRequest) = buildJsonObject {
        when (request.scope) {
            McpDiscoveryScope.User -> put("sourceScope", "user")
            McpDiscoveryScope.WslUser -> {
                put("sourceScope", "wsl-user")
                put("distro", requireNotNull(request.wslDistro))
            }
            McpDiscoveryScope.Workspace -> {
                put("sourceScope", "workspace")
                put("projectLocation", location(requireNotNull(request.owner.projectLocation)))
            }
        }
    }

    fun server(owner: SkillOwner, server: McpServer) = buildJsonObject {
        owner(owner)
        put("server", serverObject(server))
    }

    fun oauthOwner(owner: SkillOwner) = buildJsonObject { owner(owner) }

    fun oauthWait(owner: SkillOwner, flowId: String) = buildJsonObject {
        owner(owner)
        put("flowId", flowId)
    }

    fun oauthClear(owner: SkillOwner, url: String) = buildJsonObject {
        owner(owner)
        put("url", url)
    }

    fun skillScan(value: JsonObject): SkillScanResult = protect {
        SkillScanResult(
            skills = value.array("skills").map { skill(it.obj()) },
            effectiveSkillIds = value.array("effectiveSkillIds").map { it.string() }.toSet(),
            invocation = value.optionalString("invocation"),
            issues = value.array("issues").map {
                val item = it.obj()
                SkillIssue(item.string("providerId"), item.string("path"), item.string("message"))
            },
            canLinkToGlobal = value.boolean("canLinkToGlobal"),
        )
    }

    fun marketplace(value: JsonObject): MarketplaceResult = protect {
        MarketplaceResult(
            marketplace = marketplace(value.string("marketplace")),
            skills = value.array("skills").map { marketplaceSkill(it.obj()) },
            total = value.long("total"),
        )
    }

    fun imported(value: JsonObject): List<String> = protect {
        value.array("imported").map { it.string() }
    }

    fun installed(value: JsonObject): String = protect { value.string("installed") }

    fun discovery(value: JsonObject): List<ExternalMcpGroup> = protect {
        value.array("groups").map { element ->
            val group = element.obj()
            ExternalMcpGroup(
                providerId = group.string("providerId"),
                providerLabel = group.string("providerLabel"),
                sourcePath = group.string("sourcePath"),
                servers = group.array("servers").map { server -> externalServer(server.obj()) },
            )
        }
    }

    fun probe(value: JsonObject): McpProbeResult = protect {
        val environment = value.obj("environment")
        val error = value.optionalObj("error")
        McpProbeResult(
            status = value.string("status"),
            latencyMs = value.long("latencyMs"),
            runtime = environment.string("runtime"),
            projectScoped = environment.boolean("projectScoped"),
            toolCount = value.number("toolCount").toInt(),
            tools = value.optionalArray("tools")?.map { it.string() }.orEmpty(),
            errorCode = error?.optionalString("code"),
            authScheme = error?.optionalString("authScheme"),
        )
    }

    fun oauthStatus(value: JsonObject) = protect {
        McpOauthStatus(value.array("authenticatedUrls").map { it.string() }.toSet())
    }

    fun oauth(value: JsonObject): McpOauthResult = protect {
        when (value.string("status")) {
            "authorized" -> McpOauthResult.Authorized
            "redirect" -> McpOauthResult.Redirect(value.string("flowId"), value.string("authorizationUrl"))
            "error" -> McpOauthResult.Error
            else -> invalid()
        }
    }

    private fun JsonObjectBuilder.owner(owner: SkillOwner) {
        owner.projectLocation?.let { put("projectLocation", location(it)) }
    }

    private fun JsonObjectBuilder.wslDistro(location: ProjectLocation?) {
        (location as? WslProjectLocation)?.let { put("wslDistro", it.distro) }
    }

    fun location(value: ProjectLocation): JsonObject = buildJsonObject {
        when (value) {
            is PosixProjectLocation -> { put("kind", "posix"); put("path", value.path) }
            is WindowsProjectLocation -> { put("kind", "windows"); put("path", value.path) }
            is WslProjectLocation -> {
                put("kind", "wsl")
                put("distro", value.distro)
                put("linuxPath", value.linuxPath)
                put("uncPath", value.uncPath)
            }
        }
        value.remoteServerId?.let { put("remoteServerId", it) }
    }

    private fun serverObject(server: McpServer) = buildJsonObject {
        put("id", server.id)
        put("name", server.name)
        if (server.description.isNotEmpty()) put("description", server.description)
        put("enabled", server.enabled)
        put("timeoutMs", server.timeoutMs)
        if (server.disabledTools.isNotEmpty()) {
            put("disabledTools", buildJsonArray { server.disabledTools.forEach { add(JsonPrimitive(it)) } })
        }
        putJsonObject("transport") {
            when (val transport = server.transport) {
                is McpTransport.Stdio -> {
                    put("type", "stdio")
                    put("command", transport.command)
                    put("args", buildJsonArray { transport.args.forEach { add(JsonPrimitive(it)) } })
                    transport.cwd?.let { put("cwd", it) }
                    if (!transport.environment.isEmpty) putJsonObject("env") {
                        transport.environment.visit { key, secret -> put(key, secret) }
                    }
                }
                is McpTransport.Http -> {
                    put("type", if (transport.sse) "sse" else "http")
                    put("url", transport.url)
                    if (!transport.headers.isEmpty) putJsonObject("headers") {
                        transport.headers.visit { key, secret -> put(key, secret) }
                    }
                }
            }
        }
    }

    private fun skill(value: JsonObject) = SkillEntry(
        id = value.string("id"),
        name = value.string("name"),
        description = value.string("description"),
        absolutePath = value.string("absolutePath"),
        enabled = value.boolean("enabled"),
        mutable = value.boolean("mutable"),
        linked = value.boolean("linked"),
        valid = value.boolean("valid"),
        scope = if (value.string("scope") == "project") SkillScope.Project else SkillScope.Global,
        origin = value.string("origin"),
        providerLabel = value.string("providerLabel"),
        sourcePath = value.optionalString("sourcePath"),
        invalidReason = value.optionalString("invalidReason"),
        importState = value.optionalString("importState"),
    )

    private fun marketplaceSkill(value: JsonObject) = MarketplaceSkill(
        id = value.string("id"),
        skillId = value.string("skillId"),
        name = value.string("name"),
        description = value.optionalString("description"),
        marketplace = marketplace(value.string("marketplace")),
        source = value.string("source"),
        rank = value.long("rank"),
        stars = value.optionalLong("stars"),
        votes = value.optionalLong("votes"),
        installs = value.optionalLong("installs"),
        official = value.boolean("official"),
        securityGrade = value.optionalString("securityGrade"),
    )

    private fun externalServer(value: JsonObject): ExternalMcpServer {
        val transport = value.obj("transport")
        val model = when (transport.string("type")) {
            "stdio" -> McpTransport.Stdio(
                command = transport.string("command"),
                args = transport.array("args").map { it.string() },
                cwd = transport.optionalString("cwd"),
                environment = SecretValues.of(transport.optionalStringMap("env")),
            )
            "http", "sse" -> McpTransport.Http(
                url = transport.string("url"),
                headers = SecretValues.of(transport.optionalStringMap("headers")),
                sse = transport.string("type") == "sse",
            )
            else -> invalid()
        }
        return ExternalMcpServer(
            McpServer(
                id = value.string("id"),
                name = value.string("name"),
                enabled = value.boolean("enabled"),
                timeoutMs = value.long("timeoutMs"),
                transport = model,
            ),
            value.optionalString("unsupportedReason"),
        )
    }

    private fun marketplace(value: String) = when (value) {
        "skills-sh" -> SkillMarketplace.SkillsSh
        "skills-directory" -> SkillMarketplace.SkillsDirectory
        else -> invalid()
    }

    private inline fun <T> protect(block: () -> T): T = try { block() } catch (e: RemoteClientException) {
        throw e
    } catch (_: Exception) { invalid() }

    private fun invalid(): Nothing = throw RemoteClientException.invalidResponse(
        "Remote settings integrations projection failed.",
    )
}

private fun JsonElement.obj() = this as? JsonObject ?: error("invalid")
private fun JsonElement.string() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content ?: error("invalid")
private fun JsonObject.obj(name: String) = get(name)?.obj() ?: error("invalid")
private fun JsonObject.optionalObj(name: String) = get(name)?.takeUnless { it is JsonNull } as? JsonObject
private fun JsonObject.array(name: String) = get(name) as? JsonArray ?: error("invalid")
private fun JsonObject.optionalArray(name: String) = get(name) as? JsonArray
private fun JsonObject.string(name: String) = get(name)?.string() ?: error("invalid")
private fun JsonObject.optionalString(name: String) =
    (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
private fun JsonObject.boolean(name: String) = (get(name) as? JsonPrimitive)?.booleanOrNull ?: error("invalid")
private fun JsonObject.long(name: String) = (get(name) as? JsonPrimitive)?.longOrNull ?: error("invalid")
private fun JsonObject.number(name: String) = (get(name) as? JsonPrimitive)?.content?.toDoubleOrNull() ?: error("invalid")
private fun JsonObject.optionalLong(name: String) = (get(name) as? JsonPrimitive)?.longOrNull
private fun JsonObject.optionalStringMap(name: String): Map<String, String> =
    (get(name) as? JsonObject)?.mapValues { it.value.string() }.orEmpty()
