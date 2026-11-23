package com.poracode.app.transport.settings

import com.poracode.app.transport.RemoteApiClient
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Native Android wire clients covering:
 * - 10 Host Agent Update / Account / ACP Registry procedures
 * - 4 Plugin Package / Marketplace / Account procedures
 * - Memory Catalog & Sync (`memory-catalog`, `memory-sync`)
 * - Provider Usage query & targeted force refresh (`getProviderUsage`, `refreshProviderUsage`)
 * - Canonical `environment-*` route-descriptor alignment
 * - Additive Hex Voice `supportsWait` / `wait` dictation
 */
object HostParityClients {
    private val json = Json { ignoreUnknownKeys = true }

    const val MEMORY_CATALOG_ROUTE_ID = "memory-catalog"
    const val MEMORY_SYNC_ROUTE_ID = "memory-sync"

    val ENVIRONMENT_ROUTE_IDS: List<String> = listOf(
        "environment-list",
        "environment-create",
        "environment-get",
        "environment-update",
        "environment-delete",
        "environment-connect",
        "environment-disconnect",
        "environment-pairing",
        "environment-upgrade",
        "environment-websocket-ticket",
        "environment-trust-probe",
        "environment-trust-accept",
        "environment-adopt-legacy",
    )

    suspend fun callProcedure(
        procedure: String,
        payload: JsonObject = buildJsonObject {},
        api: RemoteApiClient,
    ): JsonObject {
        val envelope = buildJsonObject {
            put("procedure", procedure)
            put("payload", payload)
        }.toString()
        val raw = api.requestText(path = "/api/git/call", method = "POST", jsonBody = envelope, timeoutMs = 30_000L)
        return runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: buildJsonObject {}
    }

    // 10 Host Agent / ACP Registry procedures
    suspend fun getLatestAgentVersion(agentKind: String, api: RemoteApiClient) =
        callProcedure("getLatestAgentVersion", buildJsonObject { put("agentKind", agentKind) }, api)

    suspend fun updateAgentBinary(agentKind: String, api: RemoteApiClient) =
        callProcedure("updateAgentBinary", buildJsonObject { put("agentKind", agentKind) }, api)

    suspend fun resolveAgentAccount(agentKind: String, api: RemoteApiClient) =
        callProcedure("resolveAgentAccount", buildJsonObject { put("agentKind", agentKind) }, api)

    suspend fun listAcpRegistry(api: RemoteApiClient) =
        callProcedure("listAcpRegistry", buildJsonObject {}, api)

    suspend fun installAcpRegistryAgent(agentId: String, api: RemoteApiClient) =
        callProcedure("installAcpRegistryAgent", buildJsonObject { put("agentId", agentId) }, api)

    suspend fun updateAcpRegistryAgent(agentId: String, api: RemoteApiClient) =
        callProcedure("updateAcpRegistryAgent", buildJsonObject { put("agentId", agentId) }, api)

    suspend fun removeAcpRegistryAgent(agentId: String, api: RemoteApiClient) =
        callProcedure("removeAcpRegistryAgent", buildJsonObject { put("agentId", agentId) }, api)

    suspend fun setAcpRegistryAgentAuth(agentId: String, auth: JsonObject, api: RemoteApiClient) =
        callProcedure("setAcpRegistryAgentAuth", buildJsonObject { put("agentId", agentId); put("auth", auth) }, api)

    suspend fun authenticateAcpAgent(agentId: String, api: RemoteApiClient) =
        callProcedure("authenticateAcpAgent", buildJsonObject { put("agentId", agentId) }, api)

    suspend fun logoutAcpAgent(agentId: String, api: RemoteApiClient) =
        callProcedure("logoutAcpAgent", buildJsonObject { put("agentId", agentId) }, api)

    // 4 Plugin Package / Marketplace / Account procedures
    suspend fun listPlugins(projectId: String? = null, api: RemoteApiClient) =
        callProcedure(
            "listPlugins",
            buildJsonObject { projectId?.let { put("projectId", it) } },
            api,
        )

    suspend fun refreshPlugins(api: RemoteApiClient) =
        callProcedure("refreshPlugins", buildJsonObject {}, api)

    suspend fun pluginCatalog(action: JsonObject, api: RemoteApiClient) =
        callProcedure("pluginCatalog", action, api)

    suspend fun pluginAccounts(action: JsonObject, api: RemoteApiClient) =
        callProcedure("pluginAccounts", action, api)

    // 2 Provider Usage procedures
    suspend fun getProviderUsage(providerId: String? = null, api: RemoteApiClient) =
        callProcedure(
            "getProviderUsage",
            buildJsonObject { providerId?.let { put("providerId", it) } },
            api,
        )

    suspend fun refreshProviderUsage(providerId: String? = null, api: RemoteApiClient) =
        callProcedure(
            "refreshProviderUsage",
            buildJsonObject { providerId?.let { put("providerId", it) } },
            api,
        )

    // Memory Catalog & Sync routes
    suspend fun fetchMemoryCatalog(projectId: String? = null, api: RemoteApiClient): JsonObject {
        val query = if (projectId != null) listOf("projectId" to projectId) else emptyList()
        val raw = api.requestText(path = "/api/memory/catalog", query = query, retryableRead = true)
        return runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: buildJsonObject {}
    }

    suspend fun runMemorySync(payload: JsonObject = buildJsonObject {}, api: RemoteApiClient): JsonObject {
        val raw = api.requestText(path = "/api/memory/sync", method = "POST", jsonBody = payload.toString(), timeoutMs = 30_000L)
        return runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: buildJsonObject {}
    }

    // Additive Hex Voice `supportsWait` / `wait` dictation
    suspend fun transcribeHexVoiceWithWait(
        audioWavBase64: String,
        wait: Boolean = true,
        api: RemoteApiClient,
    ): JsonObject {
        val body = buildJsonObject {
            put("audioBase64", audioWavBase64)
            put("supportsWait", true)
            put("wait", wait)
        }.toString()
        val raw = api.requestText(path = "/api/voice/hex/transcribe", method = "POST", jsonBody = body, timeoutMs = 60_000L)
        return runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: buildJsonObject {}
    }
}
