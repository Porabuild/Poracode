// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
internal val schema_25bab2baa6662281: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("config", "prompt", "threadId"), properties = mapOf("clientContext" to schema_b23ca9582f16c4d7, "config" to schema_77c646d1a00c89a5, "prompt" to schema_bf0b727f7b1c6d07, "segments" to schema_4392338ffc80bed7, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25df6feb29c4a959: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("discoveredAt", "providerSessionId"), properties = mapOf("discoveredAt" to schema_36fea325bf1aca70, "executionIdentity" to schema_97d85a5eaee82b97, "providerSessionId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_25e47114d380c1fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("thread-item-interests")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_262f4ae53753f0fb: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("image/jpeg")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26b6bf09ccab2775: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_dc69d1c3f1fc465e, schema_c1a108aae42275ff, schema_02f5d10d12c9f077), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26c275b82ebc010d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_bc6c91ba1621863d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26cfea8cde59ada2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("directoryPath" to schema_38d1a07d3b9b1c82, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_26f96950d20651b3: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id", "label", "platform"), properties = mapOf("id" to schema_bf0b727f7b1c6d07, "isCurrent" to schema_feeb8bb50144d96d, "label" to schema_bf0b727f7b1c6d07, "lastActiveAt" to schema_3d06117798bf5171, "platform" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_274e069cdc933ee1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth-status")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_275476f9b6055811: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("repos"), properties = mapOf("repos" to schema_75b702ed8c9f54ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2778fa8937ac1709: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("threadId", "type"), properties = mapOf("threadId" to schema_bf0b727f7b1c6d07, "turnId" to schema_bf0b727f7b1c6d07, "type" to schema_b7ac3adaa07b7aa4), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2798cb9d2dca7539: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "result"), properties = mapOf("kind" to schema_3d1908a6bccf4864, "result" to schema_6a2d40d38c4527c7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_279eee1efa9da6c8: RemoteSchema by lazy {
    RemoteSchema(type = "integer", minimum = 1.0, maximum = 65535.0, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27aa97567424846c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "path", "projectId"), properties = mapOf("kind" to schema_88444d52d400622b, "path" to schema_36fea325bf1aca70, "projectId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_27d9340da4120b27: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("rationale", "threadId"), properties = mapOf("rationale" to schema_36fea325bf1aca70, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280719966e4ed3aa: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("maxActiveAgentSessions", "maxActiveGenerationHelpers", "maxActiveTerminalShells", "overloadRetryAfterMs"), properties = mapOf("maxActiveAgentSessions" to schema_56aa0e45cbdce0d0, "maxActiveGenerationHelpers" to schema_56aa0e45cbdce0d0, "maxActiveTerminalShells" to schema_56aa0e45cbdce0d0, "overloadRetryAfterMs" to schema_56aa0e45cbdce0d0, "refuseNewStarts" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_280ab70e288f77f7: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_38754692c8b5ebef, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2840caeaedca16a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("thinking"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2843e0996b9986e5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities"), properties = mapOf("capabilities" to schema_9be4e34050076f08), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_28ab5341451545c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("desktop"), JsonPrimitive("mobile"), JsonPrimitive("tablet"), JsonPrimitive("browser"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_28b9eff1da2232c5: RemoteSchema by lazy {
    RemoteSchema(type = "array", defaultValue = JsonArray(listOf()), items = schema_97d27c4efa52f52a, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_290453f28a433311: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "tabId", "url"), properties = mapOf("kind" to schema_9063020a6c5ad8b3, "tabId" to schema_36fea325bf1aca70, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_291e0a286efaf880: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("channel", "previewId", "version"), properties = mapOf("channel" to schema_3c702b70b3eb4220, "previewId" to schema_d855999aed5e6438, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_294ca0c3f20bda2e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("description", "httpsUrl", "isFork", "isPrivate", "name", "nameWithOwner", "owner", "pushedAt", "sshUrl"), properties = mapOf("description" to schema_bf0b727f7b1c6d07, "httpsUrl" to schema_bf0b727f7b1c6d07, "isFork" to schema_feeb8bb50144d96d, "isPrivate" to schema_feeb8bb50144d96d, "name" to schema_bf0b727f7b1c6d07, "nameWithOwner" to schema_bf0b727f7b1c6d07, "owner" to schema_bf0b727f7b1c6d07, "pushedAt" to schema_bf0b727f7b1c6d07, "sshUrl" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29b52750e42441f8: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_7e8114c3dda52277, schema_b305c5dcc2d06cc2, schema_f6a941e10f9feb27, schema_38c5e1151393f6bd, schema_3c594c99571d82f9), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_29fba8fe9f5724e0: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("auth", "p256dh"), properties = mapOf("auth" to schema_36fea325bf1aca70, "p256dh" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a107f95a9dcf216: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("itemId", "removedCompletedTurnAnchors", "threadId", "type"), properties = mapOf("itemId" to schema_bf0b727f7b1c6d07, "removedCompletedTurnAnchors" to schema_0f732b9fceb2c6ac, "threadId" to schema_bf0b727f7b1c6d07, "type" to schema_9d72555063ba9bd7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a150cae9967732a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("connectionId", "threadId"), properties = mapOf("connectionId" to schema_d855999aed5e6438, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a2641f29ae91ad5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("extractedAt", "sourceProvider", "sourceSessionId", "summary"), properties = mapOf("contentKind" to schema_5aa9e435f68d585e, "extractedAt" to schema_36fea325bf1aca70, "sourceProvider" to schema_36fea325bf1aca70, "sourceSessionId" to schema_36fea325bf1aca70, "summary" to schema_bf0b727f7b1c6d07, "worktreePath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a43ea36a62fa6ac: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("environment", "error", "latencyMs", "status", "toolCount"), properties = mapOf("environment" to schema_6b3ef80f7d149206, "error" to schema_5cb704413fbdf0b3, "latencyMs" to schema_56aa0e45cbdce0d0, "status" to schema_fd6258ac6546d705, "toolCount" to schema_499c88c1c549e934), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a5c67603fdb726c: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("credentialRef" to schema_c223d7ef6abf4cfd, "desired" to schema_abff99d05c43ad4c, "label" to schema_0c5d3d75e4ff2cec, "port" to schema_6db9f33ca9aa8b01, "target" to schema_a13200e46be7a2e6), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2a65cef1bc5905f9: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("skill")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a7c0f630028ad83: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "remote" to schema_bfc0c020a52f85b3), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2a8bc62fab6ac143: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("bootstrapMethods", "policy", "scopes", "sessionMethods"), properties = mapOf("bootstrapMethods" to schema_c8aab5b657a17f5e, "policy" to schema_995ee3e349270afe, "scopes" to schema_515482d2104d1efa, "sessionMethods" to schema_07a15b7253b914ac), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b430316258b9c31: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("items", "nextCursor"), properties = mapOf("historyProjection" to schema_72a4409660da2b12, "items" to schema_5d3ac76d9a521e1d, "nextCursor" to schema_60e901bdbc3f78cd, "reads" to schema_4659e6d395f41e16, "runtimeNotice" to schema_1468dfe9a2db9c9d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b4ffb830b606cf1: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_feeb8bb50144d96d, schema_bf0b727f7b1c6d07), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7595c3da8bc0e9: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "name", "parentPath"), properties = mapOf("kind" to schema_1f4518886240126e, "name" to schema_36fea325bf1aca70, "parentPath" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b7b34c95b23bb0d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("type"), properties = mapOf("type" to schema_3f5bcd72f92b6f9f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2b8805d864582a03: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("projectIds" to schema_324df5fa323e1096, "threadIds" to schema_324df5fa323e1096), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c09020b157316f2: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9751de90fd8644d6, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c0b30d69cd8870d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_75aa7b06238db739, schema_41ffeb2050e1e71c, schema_8906d017ba691d6f, schema_9e169df36e4e41f6), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c0f74a209084782: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("admin" to schema_f8b6dd8128e8bfe0, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "method" to schema_72373308389f2027, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c10059100ccb9e8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("background_tasks.changed")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c13d2fc1c3e2e03: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("disconnected"), JsonPrimitive("connecting"), JsonPrimitive("connected"), JsonPrimitive("error"), JsonPrimitive("credential-missing"), JsonPrimitive("owner-unverified"), JsonPrimitive("identity-changed"), JsonPrimitive("hostkey-mismatch"), JsonPrimitive("needs-repair"), JsonPrimitive("trust-required")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c19dd5367fc67fa: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_468209f9bb01c8a9, schema_2b7595c3da8bc0e9, schema_da66851500474562, schema_9bdd26dd832b19ef, schema_27aa97567424846c, schema_37addcca5b32752c, schema_580efa06e9547a64, schema_ebfa6f1c64210a5f, schema_94bbf8938b241fc1), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c4b8c74e6940159: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_9ec272a8244847ff, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c6061a21fb7aee6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("durationMs", "endX", "endY", "frameId", "kind", "x", "y"), properties = mapOf("durationMs" to schema_c5c5a6d768bddd81, "endX" to schema_5d4b39004bf5c532, "endY" to schema_5d4b39004bf5c532, "frameId" to schema_d855999aed5e6438, "kind" to schema_0cdfc047b0a2e1bb, "x" to schema_5d4b39004bf5c532, "y" to schema_5d4b39004bf5c532), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_2c671d62fd5c98a8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("boolean")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2c93150c89b253f9: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_247ec4acb49e6522, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2cfe911595ad978d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("fromCursor", "generation", "toCursor", "version", "watchId"), properties = mapOf("fromCursor" to schema_56aa0e45cbdce0d0, "generation" to schema_36fea325bf1aca70, "toCursor" to schema_56aa0e45cbdce0d0, "version" to schema_7f9f5a0d72de0d9a, "watchId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("terminal.cursor.output-range"))
}

internal val schema_2d0b6ec9f2b2decf: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_bf0b727f7b1c6d07, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d29c7255e1cf1b1: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("project")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d2a48957e54670a: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_55ee222c096690dc, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d52ff1140653b18: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("oauth"), JsonPrimitive("bearer"), JsonPrimitive("other"), JsonPrimitive("unknown")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d5efa5a796cb8bd: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("info"), JsonPrimitive("warning"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d677fb04187d46b: RemoteSchema by lazy {
    RemoteSchema(type = "object", defaultValue = JsonObject(mapOf("crossagents" to JsonPrimitive(true))), additionalSchema = schema_feeb8bb50144d96d, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d8274eae552cc51: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("wsl")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2d862d697d08c085: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pause"), JsonPrimitive("resume"), JsonPrimitive("clear")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e20b523bd887c4e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("name"), properties = mapOf("color" to schema_5fbc9d1e0e62e0cb, "description" to schema_bf0b727f7b1c6d07, "name" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e2f445a742056c6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_bf0b727f7b1c6d07, "name" to schema_bf0b727f7b1c6d07), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e4d2aaed030369e: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind", "title"), properties = mapOf("kind" to schema_356ae1fc455ec4c8, "title" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e59da965e611892: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("id"), properties = mapOf("id" to schema_f355c9e66a3091a2), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e5ddb0a3afed2cb: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_2e68c47efd6e1f9c, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e68c47efd6e1f9c: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("capabilities", "forge", "host", "remote", "repository"), properties = mapOf("account" to schema_c2bb40b82b330cd4, "capabilities" to schema_3ad15ffc16029f9a, "forge" to schema_eaed3cfbf46d5d81, "host" to schema_36fea325bf1aca70, "remote" to schema_36fea325bf1aca70, "repository" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2e6d7dedeb6dc9a6: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branch", "projectLocation"), properties = mapOf("branch" to schema_36fea325bf1aca70, "createNew" to schema_f8b6dd8128e8bfe0, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2eb2bd4b48793b85: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("0"), JsonPrimitive("1")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2ebee6ffa37983f2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "line", "path", "side"), properties = mapOf("body" to schema_1be16061d2974772, "line" to schema_23e05d248383ea40, "path" to schema_bd85a52dd25effae, "side" to schema_598c25a2e687258b, "startLine" to schema_23e05d248383ea40), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f0b42b84f3f48a0: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_4dea101cb65656f3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f3c74eaed971b9f: RemoteSchema by lazy {
    RemoteSchema(type = "object", additionalSchema = schema_1be5ac91cc4357cb, propertyNames = schema_bf0b727f7b1c6d07, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2f4c1755c2d3a402: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("posix", "windows", "wsl"), properties = mapOf("posix" to schema_4348fdb13264571d, "windows" to schema_4348fdb13264571d, "wsl" to schema_4348fdb13264571d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fb9be13c54e7688: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("auth-required"), JsonPrimitive("timeout"), JsonPrimitive("command-not-found"), JsonPrimitive("connection-failed"), JsonPrimitive("protocol-error"), JsonPrimitive("invalid-config"), JsonPrimitive("probe-unavailable")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fbfd962f52fe805: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("environment/not-found"), JsonPrimitive("environment/revision-conflict"), JsonPrimitive("environment/store-busy"), JsonPrimitive("environment/store-limit"), JsonPrimitive("environment/store-unavailable"), JsonPrimitive("environment/invalid-input"), JsonPrimitive("environment/not-connected"), JsonPrimitive("environment/trust-required"), JsonPrimitive("environment/trust-changed"), JsonPrimitive("environment/trust-mismatch"), JsonPrimitive("environment/hostkey-mismatch"), JsonPrimitive("environment/identity-changed"), JsonPrimitive("environment/credential-missing"), JsonPrimitive("environment/owner-unverified"), JsonPrimitive("environment/owner-unresponsive"), JsonPrimitive("environment/owner-incompatible"), JsonPrimitive("environment/owner-busy"), JsonPrimitive("environment/owner-conflict"), JsonPrimitive("environment/launch-failed"), JsonPrimitive("environment/upgrade-unavailable"), JsonPrimitive("environment/upgrade-refused"), JsonPrimitive("environment/transport-error"), JsonPrimitive("environment/cancelled"), JsonPrimitive("environment/internal-error"), JsonPrimitive("environment/not-authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_2fc59eb755b48806: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("createdAt", "rationale", "source", "threadId"), properties = mapOf("assessments" to schema_0dc750244bb89d0c, "comparisonMode" to schema_1124eb24dd0748ff, "createdAt" to schema_36fea325bf1aca70, "modelLabel" to schema_36fea325bf1aca70, "rationale" to schema_36fea325bf1aca70, "snapshotHash" to schema_36fea325bf1aca70, "source" to schema_d4e60a4c33cd4bbd, "threadId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30057dd734d040ce: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 32, items = schema_7d62681c6488867d, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3008927746cc013b: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_1b3dc298a6f3cf15, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_302783bd5327b877: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_f2bb61aa3bb8d258, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_304430ceb5560696: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_d4a49a3cee60b0ec, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30a537a9343bcdf7: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("file_change")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30b422e470a61b28: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("projectLocation", "workflowId"), properties = mapOf("ghAccount" to schema_5646cf57ff3aebe0, "projectLocation" to schema_080f9cc154af9e27, "ref" to schema_36fea325bf1aca70, "workflowId" to schema_f58a8b771657d037), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_30cc89214bd9dffb: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, maxLength = 50000, unknownPolicy = RemoteUnknownFieldPolicy.STRIP, semanticIds = listOf("string.trim"), transformIds = listOf("string.trim"))
}

internal val schema_3120d80990432c9a: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("sse")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3121eed44aed8dbf: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("agentKind", "config", "initialSize", "projectLocation", "threadId"), properties = mapOf("agentInstanceId" to schema_fa4a387c10f5125f, "agentKind" to schema_36fea325bf1aca70, "clientContext" to schema_b23ca9582f16c4d7, "config" to schema_77c646d1a00c89a5, "disabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "disabledBuiltInMcpTools" to schema_fdad254a8bac8914, "ensureRunning" to schema_d2dd3595e1b5e5dc, "initialInstructions" to schema_36fea325bf1aca70, "initialSize" to schema_55ee222c096690dc, "invariantDisabledBuiltInMcpServerIds" to schema_8d017de5d26dce37, "mcpServers" to schema_7f86e779ad379105, "mentionHandoff" to schema_d2dd3595e1b5e5dc, "presentationMode" to schema_6508684ba659826b, "projectLocation" to schema_080f9cc154af9e27, "prompt" to schema_38d1a07d3b9b1c82, "providerSwitch" to schema_06461b14925bc6d2, "questionAnswer" to schema_4d59c815dfec80c4, "segments" to schema_4392338ffc80bed7, "sessionRef" to schema_25df6feb29c4a959, "threadId" to schema_36fea325bf1aca70, "userMessageItemId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3155b0e8649e47af: RemoteSchema by lazy {
    RemoteSchema(unionKind = "anyOf", options = listOf(schema_cd124b21d98c4aa2, schema_b7c373d0981a5441), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3224b2661089874d: RemoteSchema by lazy {
    RemoteSchema(unionKind = "oneOf", options = listOf(schema_e105701b122113cd, schema_c3a4dfd6503d3858, schema_f252df24b49da178), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_324df5fa323e1096: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 200, items = schema_85c1db78d5c7dc29, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3264c4f1e6231fa5: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prompts", "truncated"), properties = mapOf("prompts" to schema_8103b4e6f4958c4c, "truncated" to schema_feeb8bb50144d96d), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32773ce5899289ad: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("authorized")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32a902996bba88be: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("devices", "generation", "platforms", "version"), properties = mapOf("devices" to schema_6c203f8f04d76313, "generation" to schema_d855999aed5e6438, "platforms" to schema_a6c274420d82c814, "version" to schema_7f9f5a0d72de0d9a), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32b2db2eaac8458c: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("command"), JsonPrimitive("other")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_32c3720f649f40a1: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("model"), properties = mapOf("contextSize" to schema_bf0b727f7b1c6d07, "effort" to schema_bf0b727f7b1c6d07, "fast" to schema_feeb8bb50144d96d, "model" to schema_bf0b727f7b1c6d07, "selectionBinding" to schema_a11ab76af3bce730, "thinking" to schema_feeb8bb50144d96d), additionalAllowed = false, unknownPolicy = RemoteUnknownFieldPolicy.REJECT)
}

internal val schema_32e268a4ad7c1c3d: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("forwardId"), properties = mapOf("forwardId" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3328521e00056564: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_0138c350a16e9103, "url" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_338293a42e7115a2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("server"), properties = mapOf("projectLocation" to schema_080f9cc154af9e27, "server" to schema_c04b1452d18edb3f), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_33c56fa54b24233a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("prNumber", "projectLocation"), properties = mapOf("forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27, "rebase" to schema_f8b6dd8128e8bfe0), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_340c8f8b68b6e2b5: RemoteSchema by lazy {
    RemoteSchema(type = "array", maxItems = 50, items = schema_9bc1c08248602f5c, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3466b9b69cc5e0cc: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("ok"), JsonPrimitive("auth-missing"), JsonPrimitive("app-not-running"), JsonPrimitive("rate-limited"), JsonPrimitive("quota-hit"), JsonPrimitive("unsupported"), JsonPrimitive("error")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3471186f1398f1d2: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("importedAt", "path"), properties = mapOf("importedAt" to schema_36fea325bf1aca70, "path" to schema_36fea325bf1aca70), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_348882537c48186f: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("body", "prNumber", "projectLocation"), properties = mapOf("body" to schema_36fea325bf1aca70, "forgeAccount" to schema_c2bb40b82b330cd4, "forgeRepository" to schema_36fea325bf1aca70, "prNumber" to schema_f58a8b771657d037, "projectLocation" to schema_080f9cc154af9e27), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3512bd687eb85e90: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("before"), JsonPrimitive("after")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_356ae1fc455ec4c8: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("rename")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35889b09eb72e208: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("branches", "ghAvailable", "status", "worktrees"), properties = mapOf("branches" to schema_d715cb198ae66d56, "ghAvailable" to schema_78c0e367e5120eb3, "status" to schema_98139abfca5e2eda, "worktrees" to schema_694e88722e472029), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35962a43ae5cecce: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("pending"), JsonPrimitive("completed"), JsonPrimitive("noop")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_35c107fafb96bccf: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("home"), JsonPrimitive("back"), JsonPrimitive("enter"), JsonPrimitive("backspace")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_3615f9310cd4ee9d: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_378174642bf763b3, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_369773f70316d070: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("effort", "fast"), properties = mapOf("effort" to schema_b6a98d4e6efc4f4c, "fast" to schema_b6a98d4e6efc4f4c), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36a14ea6cf3d0316: RemoteSchema by lazy {
    RemoteSchema(type = "object", properties = mapOf("cacheRead" to schema_f696f11685898ba7, "cacheWrite" to schema_f696f11685898ba7, "input" to schema_f696f11685898ba7, "output" to schema_f696f11685898ba7, "period" to schema_776626d20373881d, "total" to schema_f696f11685898ba7), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36b9fe91ec45bcd5: RemoteSchema by lazy {
    RemoteSchema(type = "string", literals = listOf(JsonPrimitive("select")), unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36ca2b1ea64910b4: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("comments", "threads"), properties = mapOf("comments" to schema_ac3d09b5c7f361d2, "threads" to schema_7f88819389c3ccc9), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36ebafd43b47829a: RemoteSchema by lazy {
    RemoteSchema(type = "array", items = schema_b4441316f1aafac9, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_36fea325bf1aca70: RemoteSchema by lazy {
    RemoteSchema(type = "string", minLength = 1, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}

internal val schema_370ff0ec0af5649a: RemoteSchema by lazy {
    RemoteSchema(type = "object", required = setOf("kind"), properties = mapOf("kind" to schema_4d5989d27d26b612), additionalAllowed = true, unknownPolicy = RemoteUnknownFieldPolicy.STRIP)
}
