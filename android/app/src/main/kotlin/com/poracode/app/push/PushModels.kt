package com.poracode.app.push

import com.poracode.app.model.ClientConnectionId
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

const val PUSH_ROUTING_VERSION = 1

@Serializable
data class PushRouteV1(
    val version: Int = PUSH_ROUTING_VERSION,
    val clientConnectionId: String,
    val desktopId: String,
    val threadId: String? = null,
) {
    fun connectionId(): ClientConnectionId = ClientConnectionId(clientConnectionId)
    fun registrationRoute(): PushRegistrationRouteV1 = PushRegistrationRouteV1(
        clientConnectionId = clientConnectionId,
        desktopId = desktopId,
    )
}

@Serializable
data class PushRegistrationRouteV1(
    val version: Int = PUSH_ROUTING_VERSION,
    val clientConnectionId: String,
    val desktopId: String,
)

sealed interface PushPayloadParseResult {
    data class Routed(val route: PushRouteV1) : PushPayloadParseResult
    data object NotRoutable : PushPayloadParseResult
}

object PushPayloadParser {
    const val VERSION = "version"
    const val CONNECTION_ID = "clientConnectionId"
    const val DESKTOP_ID = "desktopId"
    const val THREAD_ID = "threadId"
    val routeKeys = setOf(VERSION, CONNECTION_ID, DESKTOP_ID, THREAD_ID)

    fun parse(data: Map<String, String?>): PushPayloadParseResult {
        if (data[VERSION] != PUSH_ROUTING_VERSION.toString()) {
            return PushPayloadParseResult.NotRoutable
        }
        val connectionId = data[CONNECTION_ID]
            ?.takeIf(::isCanonicalLowercaseUuid)
            ?: return PushPayloadParseResult.NotRoutable
        val desktopId = data[DESKTOP_ID]
            ?.takeIf(::isSafeIdentifier)
            ?: return PushPayloadParseResult.NotRoutable
        val threadId = data[THREAD_ID]
            ?.takeIf(::isSafeIdentifier)
            ?: return PushPayloadParseResult.NotRoutable
        return PushPayloadParseResult.Routed(
            PushRouteV1(
                clientConnectionId = connectionId,
                desktopId = desktopId,
                threadId = threadId,
            ),
        )
    }

    fun isCanonicalLowercaseUuid(value: String): Boolean = runCatching {
        UUID.fromString(value).toString() == value
    }.getOrDefault(false)

    fun isSafeIdentifier(value: String): Boolean =
        value.isNotEmpty() && value.length <= 512 && value.none {
            it.code < 0x20 || it.code == 0x7f
        }
}

object PushCapabilityParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun routingVersions(environmentJson: String): List<Int>? = runCatching {
        val root = json.parseToJsonElement(environmentJson).jsonObject
        val versions = root["capabilities"]?.jsonObject
            ?.get("pushRouting")?.jsonObject
            ?.get("versions") as? JsonArray ?: return null
        versions.mapNotNull { it.jsonPrimitive.intOrNull }
            .takeIf { it.isNotEmpty() && it.all { version -> version > 0 } }
    }.getOrNull()
}

@Serializable
data class PushRegistrationBody(
    val deviceId: String,
    val platform: String = "android",
    val deviceToken: String,
    val appVersion: String,
    val routing: PushRegistrationRouteV1,
)

@Serializable
data class PushUnregisterBody(
    val deviceId: String,
    val routing: PushRegistrationRouteV1,
)

enum class PushAvailability {
    NotConfigured,
    StorageUnavailable,
    PermissionRequired,
    PermissionDenied,
    TokenPending,
    Available,
}

data class PushUiState(
    val availability: PushAvailability = PushAvailability.NotConfigured,
    val registeredHostCount: Int = 0,
)
